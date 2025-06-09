/**
 * HOMEBRIDGE PLUGIN ENTRY POINT
 *
 * This file serves as the main entry point for the AirTouch 5 Homebridge plugin.
 * It's responsible for registering the platform with Homebridge so that it can
 * discover and manage AirTouch devices.
 *
 * HOMEBRIDGE PLUGIN ARCHITECTURE:
 * 1. Homebridge loads this file when the plugin starts
 * 2. This file registers our AirtouchPlatform class with Homebridge
 * 3. Homebridge creates instances of our platform based on config.json
 * 4. Our platform then discovers and creates accessories (AC units, zones)
 *
 * DUAL EXPORT PATTERN:
 * This file exports the registration function in two ways to ensure maximum
 * compatibility across different Homebridge versions and Node.js environments.
 */

import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { AirtouchPlatform } from './platform';

/**
 * MODERN ES6 DEFAULT EXPORT (Homebridge 2.0+ Preferred)
 *
 * This is the modern, preferred way to export Homebridge plugins.
 * Homebridge 2.0+ will look for this export first.
 *
 * HOW IT WORKS:
 * - Homebridge calls this function during plugin initialization
 * - We receive the Homebridge API object as a parameter
 * - We register our platform class with a unique platform name
 * - The platform name must match what users put in their config.json
 *
 * REGISTRATION PROCESS:
 * 1. User adds platform config to config.json with "platform": "AirTouch5"
 * 2. Homebridge matches this to PLATFORM_NAME and calls our constructor
 * 3. Our AirtouchPlatform class handles device discovery and accessory creation
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, AirtouchPlatform);
};

/**
 * LEGACY COMMONJS EXPORT (Backward Compatibility)
 *
 * This ensures compatibility with:
 * - Older versions of Homebridge (pre-2.0)
 * - Node.js environments that don't fully support ES6 modules
 * - Build systems that transpile to CommonJS
 *
 * WHY BOTH EXPORTS?
 * Different Homebridge versions and Node.js configurations may prefer
 * different module systems. By providing both:
 * - ES6-capable systems use the default export (cleaner, modern)
 * - Legacy systems fall back to module.exports (reliable, compatible)
 *
 * This is a common pattern in Node.js libraries that need to support
 * both old and new environments.
 */
module.exports = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, AirtouchPlatform);
};

/**
 * WHAT HAPPENS NEXT?
 *
 * After registration, Homebridge will:
 * 1. Read the user's config.json file
 * 2. Find any platform entries with "platform": "AirTouch5"
 * 3. Create instances of AirtouchPlatform for each config entry
 * 4. Call the platform's constructor with the config and API
 * 5. Our platform then discovers AirTouch devices and creates accessories
 *
 * PLUGIN LIFECYCLE:
 * Registration (this file) → Platform Creation → Device Discovery →
 * Accessory Creation → Service Setup → HomeKit Integration
 *
 * TROUBLESHOOTING:
 * If users report "Platform not found" errors, it usually means:
 * - PLATFORM_NAME doesn't match their config.json "platform" field
 * - This registration function isn't being called (plugin loading issue)
 * - There's an error in the import statements preventing execution
 */

/**
 * EXAMPLE CONFIG.JSON ENTRY:
 *
 * {
 *   "platforms": [
 *     {
 *       "platform": "AirTouch5",     // Must match PLATFORM_NAME
 *       "name": "AirTouch",          // User-friendly name
 *       "ip": "192.168.1.100",       // Optional: specific IP
 *       "discoverDevices": true      // Optional: auto-discovery
 *     }
 *   ]
 * }
 */