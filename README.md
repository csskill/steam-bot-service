Steam Bot Service
=================

A small Node.js service that maintains a persistent connection to Steam and exposes a simple HTTP API for common bot actions.

This service is designed to run as a long-lived process and can:

*   Accept incoming friend requests
    
*   Check whether a Steam user is already a friend
    
*   Send chat messages to friends
    
*   Stay online by launching CS2 (AppID 730)
    

Features
--------

*   Persistent Steam connection using steam-user
    
*   Optional Steam Guard 2FA via shared secret
    
*   HTTP API (no framework, just Node.js)
    
*   Automatic handling of pending friend requests
    
*   Graceful shutdown support
    

Requirements
------------

*   Node.js 18+ (earlier versions may work, but are not tested)
    
*   A Steam account dedicated to the bot
    

Installation
------------

Clone the repository and install dependencies:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   git clone https://github.com/yourusername/steam-bot-service.git  cd steam-bot-service  npm install   `

Configuration
-------------

The service is configured entirely via environment variables.

VariableRequiredDescriptionSTEAM\_USERNAMEYesSteam account usernameSTEAM\_PASSWORDYesSteam account passwordSTEAM\_SHARED\_SECRETNoSteam Guard shared secret (for 2FA)PORTNoHTTP server port (default: 5001)

Example:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   export STEAM_USERNAME="my_bot_account"  export STEAM_PASSWORD="supersecret"  export STEAM_SHARED_SECRET="BASE64_SHARED_SECRET"  export PORT=5001   `

Running the Service
-------------------

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   node steam-bot-service.js   `

On startup, the service will:

1.  Log into Steam
    
2.  Set the persona to Online
    
3.  Launch CS2 to keep the connection active
    
4.  Start an HTTP server
    

HTTP API
--------

All endpoints return JSON.

### GET /status

Returns the current status of the bot.

Example response:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "connected": true,    "ready": true,    "friendsCount": 12,    "pendingRequests": 0  }   `

### POST /accept-friend-requests

Accepts **all pending friend requests**.

Example response:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "success": true,    "accepted": 3,    "errors": []  }   `

### POST /is-friend

Checks if a Steam ID is already a friend.

Request body:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "steamId": "76561198000000000"  }   `

Response:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "success": true,    "isFriend": true  }   `

### POST /send-message

Sends a chat message to a friend.

Request body:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "steamId": "76561198000000000",    "message": "Hello from the bot!"  }   `

Response:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "success": true  }   `

Notes & Warnings
----------------

*   This project is **not affiliated with Valve or Steam**
    
*   Use a **dedicated bot account**
    
*   Be mindful of Steam rate limits and terms of service
    
*   Do not expose this service publicly without authentication
    

License
-------

MIT
