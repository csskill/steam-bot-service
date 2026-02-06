const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const path = require('path');
const fs = require('fs');

const APPID_CS2 = 730;

class SteamBotService {
  constructor({ username, password, sharedSecret, dataDir }) {
    if (!username || !password) {
      throw new Error('username and password are required');
    }

    this.username = username;
    this.password = password;
    this.sharedSecret = sharedSecret || null;

    this.isConnected = false;
    this.isReady = false;
    this.friends = new Map();
    this.pendingFriendRequests = [];

    const sentryDir = path.join(
      dataDir || process.cwd(),
      'sentry',
      username.replace(/[^a-zA-Z0-9]/g, '_')
    );

    fs.mkdirSync(sentryDir, { recursive: true });

    this.client = new SteamUser({ dataDirectory: sentryDir });
    this.setupHandlers();
  }


  setupHandlers() {
    this.client.on('loggedOn', () => {
      console.log('✓ Steam bot logged in');
      this.isConnected = true;
      this.client.setPersona(SteamUser.EPersonaState.Online);

      // Launch CS2 to keep connection active
      setTimeout(() => {
        this.client.gamesPlayed([APPID_CS2]);
      }, 1000);

      // Wait a bit for friends list to load, then check for pending requests
      setTimeout(() => {
        this.checkForPendingFriendRequests();
      }, 3000);
    });

    this.client.on('error', (err) => {
      console.error('Steam error:', err.message);
      this.isConnected = false;
      this.isReady = false;
    });

    this.client.on('friendRelationship', (steamId, relationship) => {
      const steamIdStr = steamId.toString();

      // EFriendRelationship.RequestRecipient = 2
      if (relationship === 2) {
        // Incoming friend request
        console.log(`📥 Incoming friend request from ${steamIdStr}`);
        this.pendingFriendRequests.push({
          steamId: steamIdStr,
          timestamp: Date.now()
        });
      } else if (relationship === 3) {
        // EFriendRelationship.Friend = 3
        // Now a friend
        console.log(`✓ ${steamIdStr} is now a friend`);
        this.updateFriendsList();
      } else if (relationship === 0) {
        // EFriendRelationship.None = 0
        // Removed from friends
        console.log(`✗ ${steamIdStr} removed from friends`);
        this.friends.delete(steamIdStr);
      }
    });

    this.client.on('friendMessage', (steamId, message, messageType) => {
      // Handle incoming messages if needed
      console.log(`💬 Message from ${steamId}: ${message}`);
    });

    this.client.on('relationships', () => {
      this.updateFriendsList();
      // Also check for pending requests when relationships update
      this.checkForPendingFriendRequests();
    });
  }

  /**
   * Check myFriends for pending friend requests (relationship = 2)
   * This catches requests that were sent before the bot connected
   */
  checkForPendingFriendRequests() {
    if (!this.client.myFriends) {
      return;
    }

    const foundRequests = [];
    for (const [steamId, relationship] of Object.entries(this.client.myFriends)) {
      // EFriendRelationship.RequestRecipient = 2
      if (relationship === 2) {
        const steamIdStr = steamId.toString();
        // Check if we already have this request tracked
        const alreadyTracked = this.pendingFriendRequests.some(req => req.steamId === steamIdStr);
        if (!alreadyTracked) {
          console.log(`📥 Found pending friend request from ${steamIdStr}`);
          this.pendingFriendRequests.push({
            steamId: steamIdStr,
            timestamp: Date.now()
          });
          foundRequests.push(steamIdStr);
        }
      }
    }

    if (foundRequests.length > 0) {
      console.log(`📋 Found ${foundRequests.length} pending friend request(s)`);
    }
  }

  updateFriendsList() {
    if (!this.client.myFriends) {
      return;
    }

    this.friends.clear();
    for (const [steamId, relationship] of Object.entries(this.client.myFriends)) {
      // SteamUser.EFriendRelationship.Friend = 3
      if (relationship === 3) {
        this.friends.set(steamId.toString(), {
          steamId: steamId.toString(),
          relationship: relationship
        });
      }
    }
    console.log(`📋 Friends list updated: ${this.friends.size} friends`);

    // Log all friends for debugging
    if (this.friends.size > 0) {
      const friendIds = Array.from(this.friends.keys());
      console.log(`   Friends: ${friendIds.join(', ')}`);
    }
  }

  async login(steamGuardCode = null) {
    return new Promise((resolve, reject) => {
      const logonOptions = {
        accountName: this.username,
        password: this.password
      };

      // Generate 2FA code if shared secret is available
      if (this.sharedSecret && !steamGuardCode) {
        try {
          steamGuardCode = SteamTotp.generateAuthCode(this.sharedSecret);
          console.log('✓ Generated 2FA code from shared secret');
          logonOptions.twoFactorCode = steamGuardCode;
        } catch (err) {
          console.log('⚠ Failed to generate 2FA code:', err.message);
        }
      } else if (steamGuardCode) {
        logonOptions.twoFactorCode = steamGuardCode;
      }

      const timeout = setTimeout(() => reject(new Error('Login timeout')), 30000);

      const steamGuardHandler = (domain, callback) => {
        if (steamGuardCode) {
          callback(steamGuardCode);
        } else if (this.sharedSecret) {
          try {
            const code = SteamTotp.generateAuthCode(this.sharedSecret);
            callback(code);
          } catch (err) {
            clearTimeout(timeout);
            reject(new Error('Steam Guard code required but shared secret is invalid'));
          }
        } else {
          clearTimeout(timeout);
          reject(new Error('Steam Guard code required but not provided'));
        }
      };

      this.client.once('steamGuard', steamGuardHandler);

      this.client.once('loggedOn', () => {
        clearTimeout(timeout);
        this.updateFriendsList();
        this.isReady = true;
        resolve();
      });

      this.client.once('error', (err) => {
        clearTimeout(timeout);
        if (err.eresult === 5) {
          console.log('⚠️  Cached credentials expired, trying password login...');
          this.client.logOn({
            accountName: this.username,
            password: this.password
          });
        } else {
          reject(err);
        }
      });

      this.client.logOn(logonOptions);
    });
  }

  acceptFriendRequest(steamId) {
    if (!this.isConnected) {
      throw new Error('Not connected to Steam');
    }

    try {
      // steam-user uses addFriend to accept incoming requests
      this.client.addFriend(steamId);
      console.log(`✓ Accepted friend request from ${steamId}`);
      return true;
    } catch (err) {
      console.error(`✗ Failed to accept friend request from ${steamId}:`, err.message);
      return false;
    }
  }

  acceptAllPendingFriendRequests() {
    if (!this.isConnected) {
      return { accepted: 0, errors: [] };
    }

    // First, check for any pending requests in myFriends (catches requests sent before connection)
    this.checkForPendingFriendRequests();

    const accepted = [];
    const errors = [];

    // Accept all pending requests
    for (const request of this.pendingFriendRequests) {
      try {
        if (this.acceptFriendRequest(request.steamId)) {
          accepted.push(request.steamId);
        } else {
          errors.push(request.steamId);
        }
      } catch (err) {
        errors.push({ steamId: request.steamId, error: err.message });
      }
    }

    // Clear pending requests after processing
    this.pendingFriendRequests = [];

    return { accepted: accepted.length, errors };
  }

  isFriend(steamId) {
    const steamIdStr = steamId.toString();

    // First check our cached friends list
    if (this.friends.has(steamIdStr)) {
      return true;
    }

    // Also check myFriends directly in case cache is stale
    if (this.client.myFriends) {
      for (const [id, relationship] of Object.entries(this.client.myFriends)) {
        if (id.toString() === steamIdStr && relationship === 3) {
          // Update cache
          this.friends.set(steamIdStr, {
            steamId: steamIdStr,
            relationship: relationship
          });
          return true;
        }
      }
    }

    return false;
  }

  sendMessage(steamId, message) {
    if (!this.isConnected) {
      throw new Error('Not connected to Steam');
    }

    if (!this.isFriend(steamId)) {
      throw new Error(`User ${steamId} is not a friend`);
    }

    try {
      // steam-user uses chatMessage to send messages
      this.client.chatMessage(steamId, message);
      console.log(`✓ Sent message to ${steamId}`);
      return true;
    } catch (err) {
      console.error(`✗ Failed to send message to ${steamId}:`, err.message);
      throw err;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      ready: this.isReady,
      friendsCount: this.friends.size,
      pendingRequests: this.pendingFriendRequests.length
    };
  }
}

module.exports = SteamBotService;
