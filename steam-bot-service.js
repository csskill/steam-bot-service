#!/usr/bin/env node
/**
 * Persistent Steam Bot Service
 * 
 * This service maintains a persistent connection to Steam
 * and provides an HTTP API for:
 * - Accepting friend requests
 * - Checking if a user is a friend
 * - Sending messages to friends
 * 
 * Usage:
 *   node steam-bot-service.js
 * 
 * Environment variables:
 *   STEAM_USERNAME - Bot account username (account 0)
 *   STEAM_PASSWORD - Bot account password
 *   STEAM_SHARED_SECRET - 2FA shared secret (optional)
 *   PORT - HTTP API port (default: 5001)
 */

const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 5001;
const APPID_CS2 = 730;

class SteamBotService {
    constructor(username, password, sharedSecret = null) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.isConnected = false;
        this.isReady = false;
        this.friends = new Map(); // steamId -> friend info
        this.pendingFriendRequests = [];

        // Use unique sentry directory
        const sentryDir = path.join(
            __dirname,
            'sentry',
            username.replace(/[^a-zA-Z0-9]/g, '_')
        );

        fs.mkdirSync(sentryDir, { recursive: true });

        this.client = new SteamUser({
            dataDirectory: sentryDir
        });

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

// Initialize bot service
const username = process.env.STEAM_USERNAME || '';
const password = process.env.STEAM_PASSWORD || '';
const sharedSecret = process.env.STEAM_SHARED_SECRET || null;

if (!username || !password) {
    console.error('Error: STEAM_USERNAME and STEAM_PASSWORD environment variables are required');
    process.exit(1);
}

const bot = new SteamBotService(username, password, sharedSecret);

// HTTP API Server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse JSON body for POST requests
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        let data = {};
        if (body) {
            try {
                data = JSON.parse(body);
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Route handling
        if (pathname === '/status' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(bot.getStatus()));
        } else if (pathname === '/accept-friend-requests' && method === 'POST') {
            const result = bot.acceptAllPendingFriendRequests();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...result }));
        } else if (pathname === '/is-friend' && method === 'POST') {
            const steamId = data.steamId;
            if (!steamId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'steamId is required' }));
                return;
            }
            const isFriend = bot.isFriend(steamId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, isFriend }));
        } else if (pathname === '/send-message' && method === 'POST') {
            const { steamId, message } = data;
            if (!steamId || !message) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'steamId and message are required' }));
                return;
            }
            try {
                bot.sendMessage(steamId, message);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Not found' }));
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Steam Bot Service listening on port ${PORT}`);
    console.log(`📡 Account: ${username}`);

    // Login to Steam
    bot.login().then(() => {
        console.log('✅ Steam Bot Service ready');
    }).catch(err => {
        console.error('❌ Failed to login:', err.message);
        process.exit(1);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    bot.client.logOff();
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    bot.client.logOff();
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});
 
