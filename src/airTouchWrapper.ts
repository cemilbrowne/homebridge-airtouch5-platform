import { Logger } from 'homebridge';
import { AirtouchAPI, AcAbility, AcStatus, ZoneStatus } from './api';
import { AirTouchZoneAccessory } from './platformZoneAccessory';
import { AirTouchACAccessory } from './platformACAccessory';
import { EventEmitter } from 'events';
import { AirtouchPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MAGIC } from './magic';

/**
 * Represents an Air Conditioning unit within the AirTouch 5 system.
 * Maps to the AC ability (0xFF 0x11) and AC status (0x23) protocol messages.
 */
export interface AC {
    ac_number: number;              // AC unit number (0-7 as per protocol)
    ac_ability: AcAbility;          // AC capabilities from extended message 0xFF 0x11
    ac_status?: AcStatus;           // Current AC status from message type 0x23
    registered: boolean;            // Whether this AC is registered with HomeKit
    ac_accessory?: AirTouchACAccessory;
}

/**
 * Represents a Zone within the AirTouch 5 system.
 * Maps to zone status (0x21) and zone control (0x20) protocol messages.
 */
export interface Zone {
    zone_number: number;            // Zone number (0-15 as per protocol)
    ac_number: number;              // Parent AC unit number
    zone_name: string;              // Zone name from extended message 0xFF 0x13
    zone_status?: ZoneStatus;       // Current zone status from message type 0x21
    registered: boolean;            // Whether this zone is registered with HomeKit
    zone_accessory?: AirTouchZoneAccessory;
}

/**
 * AirTouch 5 Wrapper Class
 *
 * This class wraps the AirTouch 5 communication protocol and manages the hierarchical
 * structure: Controller -> AC Units -> Zones
 *
 * Protocol Communication:
 * - TCP connection on port 9005
 * - Message format: Header(4) + Address(2) + MsgID(1) + Type(1) + DataLen(2) + Data + CRC(2)
 * - Control messages (0xC0): Zone control (0x20), Zone status (0x21), AC control (0x22), AC status (0x23)
 * - Extended messages (0x1F): AC ability (0xFF 0x11), Zone names (0xFF 0x13), etc.
 */
export class Airtouch5Wrapper {
  // Connection and identification properties
  ip: string;                     // AirTouch 5 console IP address
  consoleId: string;              // Console ID from UDP discovery response
  AirtouchId: string;             // AirTouch ID from UDP discovery response
  deviceName: string;             // Device name from UDP discovery response

  // Core components
  platform: AirtouchPlatform;     // Homebridge platform instance
  api: AirtouchAPI;               // Low-level protocol API handler
  log: Logger;                    // Homebridge logger
  emitter: EventEmitter;          // Event system for status updates

  // Device collections - indexed by their respective numbers
  acs: Array<AC>;                 // AC units collection (index = ac_number)
  zones: Array<Zone>;             // Zones collection (index = zone_number)

  constructor(ip: string,
    consoleId: string,
    AirtouchId: string,
    deviceName: string,
    log: Logger,
    emitter: EventEmitter,
    platform: AirtouchPlatform) {

    this.platform = platform;
    this.ip = ip;
    this.log = log;
    this.consoleId = consoleId;
    this.AirtouchId = AirtouchId;
    this.deviceName = deviceName;
    this.emitter = emitter;

    // Initialize the low-level API and establish TCP connection
    this.api = new AirtouchAPI(ip, consoleId, AirtouchId, deviceName, log, emitter);
    this.api.connect();

    // Initialize device collections
    this.acs = new Array<AC>();
    this.zones = new Array<Zone>();
  }

  /**
   * Process AC Ability message (Extended message 0xFF 0x11)
   *
   * This handles the response from requesting AC capabilities, which includes:
   * - AC name (16 bytes)
   * - Start zone number and zone count
   * - Supported modes (auto, cool, heat, dry, fan)
   * - Supported fan speeds (auto, quiet, low, medium, high, powerful, turbo, intelligent)
   * - Temperature ranges for heating and cooling
   *
   * @param ac_ability - AC capability data from protocol message
   */
  AddAcAbility(ac_ability: AcAbility) {
    const ac_number = +ac_ability.ac_unit_number;
    const result = this.acs[ac_number];

    if(result === undefined) {
      // Create new AC unit and initialize its zones
      this.createAc(ac_number, ac_ability);
      this.initialiseZonesForAc(ac_number, ac_ability);
    } else {
      // AC already exists - this plugin doesn't support changing AC abilities
      this.log.debug('ATWRAP  | Received duplicate AC Capability - this plugin doesn\'t support changing AC abilities', ac_number);
    }
  }

  /**
   * Initialize zones for a specific AC unit based on its ability data.
   *
   * Each AC unit controls a contiguous range of zones as specified in the AC ability:
   * - ac_start_zone: First zone number controlled by this AC
   * - ac_zone_count: Number of zones controlled by this AC
   *
   * @param ac_number - AC unit number (0-7)
   * @param ac_ability - AC capability data containing zone mapping
   */
  initialiseZonesForAc(ac_number: number, ac_ability: AcAbility) {
    const start_zone: number = +ac_ability.ac_start_zone;
    const count_zones: number = +ac_ability.ac_zone_count;

    // Create zones for the range [start_zone, start_zone + count_zones)
    for (let i:number = start_zone; i<(start_zone+count_zones); i++) {
      if(this.zones[i] === undefined) {
        this.createZone(i, ac_number);
      }
      // Map this zone to its parent AC unit
      this.zones[i].ac_number = ac_number;
    }
  }

  /**
   * Process Zone Status message (0x21)
   *
   * Handles zone status updates containing:
   * - Power state (Off=0, On=1, Turbo=3)
   * - Control method (Temperature=1, Percentage=0)
   * - Current and target temperatures
   * - Damper position percentage
   * - Sensor presence and temperature readings
   * - Battery and spill status
   *
   * @param zone_status - Zone status data from protocol message
   */
  AddUpdateZoneStatus(zone_status: ZoneStatus) {
    const zone_number = +zone_status.zone_number;

    // Ensure zone name is preserved from our local cache
    zone_status.zone_name = this.zones[zone_number].zone_name;

    this.log.debug('ATWRAP  | Zone Details: %s', this.formatZoneStatus(zone_status));

    if (this.zones[zone_number] === undefined) {
      this.log.error(`ATWRAP  | Cannot update Zone ${zone_number}: not initialized`);
      return;
    }

    // Update zone status and notify the accessory if it's registered
    this.zones[zone_number].zone_status = zone_status;
    const ac_number = this.zones[zone_number].ac_number;

    if (this.zones[zone_number].registered === true) {
      this.zones[zone_number].zone_accessory!.updateStatus(this.zones[zone_number], this.acs[ac_number]);
    }
  }

  /**
   * Process Zone Name message (Extended message 0xFF 0x13)
   *
   * Updates zone names received from the AirTouch system.
   * Zone names are typically 16 bytes max, null-terminated if shorter.
   *
   * @param in_zone_number - Zone number (0-15)
   * @param zone_name - Human-readable zone name
   */
  AddZoneName(in_zone_number: number, zone_name: string) {
    const zone_number = +in_zone_number;

    if(this.zones[zone_number].zone_name === undefined) {
      this.log.error('ATWRAP  | Got an updated zone name, but zone hasn\'t been initialised yet number: '+zone_number);
      return;
    } else {
      this.zones[zone_number].zone_name = zone_name;

      // Register the zone with HomeKit now that we have its name
      if(this.zones[zone_number].registered === false) {
        this.registerZone(zone_number, this.zones[zone_number].ac_number);
      }
    }
  }

  /**
   * Attempt to reconnect to the AirTouch 5 system.
   * Called when the TCP connection is lost or encounters errors.
   */
  AttemptReconnect() {
    this.api.connect();
  }

  /**
   * Process AC Status message (0x23)
   *
   * Handles AC status updates containing:
   * - Power state (Off=0, On=1, Away(Off)=2, Away(On)=3, Sleep=5)
   * - Mode (auto=0, heat=1, dry=2, fan=3, cool=4, auto heat=8, auto cool=9)
   * - Fan speed (auto=0, quiet=1, low=2, med=3, high=4, powerful=5, turbo=6, intelligent=9-14)
   * - Current and target temperatures
   * - Status flags (turbo, bypass, spill, timer)
   * - Error codes
   *
   * @param ac_status - AC status data from protocol message
   */
  AddUpdateAcStatus(ac_status: AcStatus) {
    const ac_number = +ac_status.ac_unit_number;
    this.log.debug('ATWRAP  | Got ac number %d, ac_status %s count of this.acs is %d', ac_number, JSON.stringify(ac_status), this.acs.length);
    const ac_name = this.acs[ac_number].ac_ability.ac_name;

    this.log.debug(`ATWRAP  | ${ac_name} details: ${this.getAcStatusSummary(ac_status)}`);

    const result = this.acs[ac_number];
    if(result === undefined) {
      this.log.debug('ATWRAP  | Error condition adding AC Status - no existing AC with abilities with num: ', ac_number);
      return;
    } else {
      result.ac_status = ac_status;

      // Register AC with HomeKit if not already done
      if(result.registered === false) {
        this.registerAc(ac_number);
      }

      // Update the AC accessory with new status
      this.acs[ac_number].ac_accessory!.updateStatus(this.acs[ac_number], this.zones);
    }
  }

  /**
   * Create a new AC unit from ability data.
   *
   * Logs comprehensive AC configuration including:
   * - Name and zone assignment
   * - Available modes and fan speeds
   * - Temperature ranges for heating and cooling
   *
   * @param ac_number - AC unit number (0-7)
   * @param ac_ability - AC capability data
   */
  createAc(ac_number: number, ac_ability: AcAbility) {
    // Create detailed configuration summary for logging
    const info = [
      `  Name: ${ac_ability.ac_name}`,
      `  Zones: ${ac_ability.ac_zone_count} (starting from ${ac_ability.ac_start_zone})`,
      `  Modes: ${this.getAvailableModes(ac_ability).join(', ')}`,
      `  Fan Speeds: ${this.getAvailableFanSpeeds(ac_ability).join(', ')}`,
      `  Cool Range: ${ac_ability.ac_min_cool}°C - ${ac_ability.ac_max_cool}°C`,
      `  Heat Range: ${ac_ability.ac_min_heat}°C - ${ac_ability.ac_max_heat}°C`,
    ];

    this.log.info('ATWRAP  | Creating AC %s (%d)', ac_ability.ac_name, ac_number);
    this.log.debug('ATWRAP  | AC Configuration:' + info.join(', '));

    // Initialize AC object (not yet registered with HomeKit)
    this.acs[ac_number] = {
      ac_number: ac_number,
      ac_ability: ac_ability,
      registered: false,
    };
  }

  /**
   * Create a new zone with default settings.
   * Zone will be registered with HomeKit once we receive its name and status.
   *
   * @param zone_number - Zone number (0-15)
   * @param ac_number - Parent AC unit number
   */
  createZone(zone_number: number, ac_number: number) {
    this.zones[zone_number] = {
      zone_number: zone_number,
      ac_number: ac_number,
      zone_name: 'Zone '+zone_number,  // Default name until we receive the actual name
      registered: false,
    };
  }

  /**
   * Register a zone with HomeKit.
   *
   * Creates or retrieves the platform accessory and wraps it with our zone accessory class.
   * This enables control through HomeKit and updates from the AirTouch system.
   *
   * @param zone_number - Zone number to register
   * @param ac_number - Parent AC unit number
   */
  registerZone(zone_number: number, ac_number: number) {
    // Ensure we have zone status before registering
    if(this.zones[zone_number].zone_status === undefined) {
      this.log.error('ATWRAP  | Attempting to register a Zone without a status.');
      return;
    }

    // Generate unique UUID for this accessory
    const uuid = this.platform.api.hap.uuid.generate('Zone '+this.AirtouchId+ac_number+zone_number);

    // Find existing accessory or create new one
    let platform_accessory = this.platform.findAccessory(this.AirtouchId, ac_number, MAGIC.ZONE_OR_AC.ZONE, zone_number);
    if(platform_accessory === undefined) {
      // Create new platform accessory
      platform_accessory = new this.platform.api.platformAccessory(this.zones[zone_number].zone_name, uuid);
      platform_accessory.context.zone_number = zone_number;
      platform_accessory.context.ac_number = ac_number;
      platform_accessory.context.AirtouchId = this.AirtouchId;
      platform_accessory.context.zone_or_ac = MAGIC.ZONE_OR_AC.ZONE;

      // Register with HomeKit
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platform_accessory]);
    }

    // Create our zone accessory wrapper
    const zone_accessory:AirTouchZoneAccessory = new AirTouchZoneAccessory(
      this.platform,
      platform_accessory,
      this.AirtouchId,
      zone_number,
      this.zones[zone_number],
      this.acs[ac_number],
      this.log,
      this.api,
    );

    // Link the accessory and mark as registered
    this.zones[zone_number].zone_accessory = zone_accessory;
    this.zones[zone_number].registered = true;
  }

  /**
   * Register an AC unit with HomeKit.
   *
   * Creates or retrieves the platform accessory and wraps it with our AC accessory class.
   * This enables control through HomeKit and updates from the AirTouch system.
   *
   * @param ac_number - AC unit number to register
   */
  registerAc(ac_number: number) {
    // Ensure we have AC status before registering
    if(this.acs[ac_number].ac_status === undefined) {
      this.log.error('ATWRAP  | Attempting to register an AC without a status.');
      return;
    }

    this.log.debug('ATWRAP  | Register AC being called for acnumber: '+ac_number);

    // Generate unique UUID for this accessory
    const uuid = this.platform.api.hap.uuid.generate('AC '+this.AirtouchId+ac_number);

    // Find existing accessory or create new one
    let platform_accessory = this.platform.findAccessory(this.AirtouchId, ac_number, MAGIC.ZONE_OR_AC.AC);
    if(platform_accessory === undefined) {
      // Create new platform accessory
      platform_accessory = new this.platform.api.platformAccessory(this.acs[ac_number].ac_ability.ac_name, uuid);
      platform_accessory.context.ac_number = ac_number;
      platform_accessory.context.AirtouchId = this.AirtouchId;
      platform_accessory.context.zone_or_ac = MAGIC.ZONE_OR_AC.AC;

      // Register with HomeKit
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platform_accessory]);
    }

    // Create our AC accessory wrapper
    const ac_accessory = new AirTouchACAccessory(
      this.platform,
      platform_accessory,
      this.AirtouchId,
      ac_number,
      this.acs[ac_number],
      this.zones,
      this.log,
      this.api,
    );

    // Link the accessory and mark as registered
    this.acs[ac_number].ac_accessory = ac_accessory;
    this.acs[ac_number].registered = true;
  }

  /**
   * Extract available modes from AC ability flags.
   * Maps protocol bit flags to human-readable mode names.
   *
   * @param ac_ability - AC capability data
   * @returns Array of supported mode names
   */
  private getAvailableModes(ac_ability: AcAbility): string[] {
    const modes: string[] = [];

    // Check each mode support flag (bit fields in protocol)
    if (ac_ability.ac_support_auto_mode === 1) {
      modes.push('Auto');
    }
    if (ac_ability.ac_support_cool_mode === 1) {
      modes.push('Cool');
    }
    if (ac_ability.ac_support_heat_mode === 1) {
      modes.push('Heat');
    }
    if (ac_ability.ac_support_dry_mode === 1) {
      modes.push('Dry');
    }
    if (ac_ability.ac_support_fan_mode === 1) {
      modes.push('Fan');
    }

    return modes.length > 0 ? modes : ['None'];
  }

  /**
   * Extract available fan speeds from AC ability flags.
   * Maps protocol bit flags to human-readable fan speed names.
   *
   * @param ac_ability - AC capability data
   * @returns Array of supported fan speed names
   */
  private getAvailableFanSpeeds(ac_ability: AcAbility): string[] {
    const speeds: string[] = [];

    // Check each fan speed support flag (bit fields in protocol)
    if (ac_ability.ac_support_fan_auto === 1) {
      speeds.push('Auto');
    }
    if (ac_ability.ac_support_fan_quiet === 1) {
      speeds.push('Quiet');
    }
    if (ac_ability.ac_support_fan_low === 1) {
      speeds.push('Low');
    }
    if (ac_ability.ac_support_fan_medium === 1) {
      speeds.push('Medium');
    }
    if (ac_ability.ac_support_fan_high === 1) {
      speeds.push('High');
    }
    if (ac_ability.ac_support_fan_powerful === 1) {
      speeds.push('Powerful');
    }
    if (ac_ability.ac_support_fan_turbo === 1) {
      speeds.push('Turbo');
    }
    if (ac_ability.ac_support_fan_intelligent === 1) {
      speeds.push('Intelligent');
    }

    return speeds.length > 0 ? speeds : ['None'];
  }

  /**
   * Format temperature value for display.
   * Handles protocol temperature encoding and invalid values.
   *
   * @param temp - Raw temperature value from protocol
   * @returns Formatted temperature string
   */
  private formatTemperature(temp: number): string {
    // Validate temperature range (protocol uses invalid markers)
    if (isNaN(temp) || temp < -50 || temp > 150) {
      return 'N/A';
    }

    return `${temp.toFixed(1)}°C`;
  }

  /**
   * Convert zone power state code to human-readable string.
   * Maps protocol power state values to descriptive text.
   *
   * @param zone_status - Zone status containing power state
   * @returns Human-readable power state
   */
  private getZonePowerState(zone_status: ZoneStatus): string {
    switch (zone_status.zone_power_state) {
      case 0:
        return 'Off';
      case 1:
        return 'On';
      case 3:
        return 'Turbo';
      default:
        return `Unknown (${zone_status.zone_power_state})`;
    }
  }

  /**
   * Convert zone control type flag to human-readable string.
   *
   * @param zone_status - Zone status containing control type flag
   * @returns Control type description
   */
  private getZoneControlType(zone_status: ZoneStatus): string {
    if (zone_status.zone_control_type === 1) {
      return 'Temperature';
    } else {
      return 'Percentage';
    }
  }

  /**
   * Convert zone sensor presence flag to human-readable string.
   *
   * @param zone_status - Zone status containing sensor flag
   * @returns Sensor presence description
   */
  private getZoneSensorStatus(zone_status: ZoneStatus): string {
    if (zone_status.zone_has_sensor === 1) {
      return 'Yes';
    } else {
      return 'No';
    }
  }

  /**
   * Convert zone battery status flag to human-readable string.
   *
   * @param zone_status - Zone status containing battery flag
   * @returns Battery status description
   */
  private getZoneBatteryStatus(zone_status: ZoneStatus): string {
    if (zone_status.zone_battery_low === 1) {
      return 'Low';
    } else {
      return 'Normal';
    }
  }

  /**
   * Convert zone spill status flag to human-readable string.
   * Spill refers to air overflow when dampers can't close completely.
   *
   * @param zone_status - Zone status containing spill flag
   * @returns Spill status description
   */
  private getZoneSpillStatus(zone_status: ZoneStatus): string {
    if (zone_status.zone_has_spill === 1) {
      return 'Active';
    } else {
      return 'Inactive';
    }
  }

  /**
   * Format comprehensive zone status for logging.
   * Creates a detailed status string with all relevant zone information.
   *
   * @param zone_status - Complete zone status data
   * @returns Formatted status string for logging
   */
  private formatZoneStatus(zone_status: ZoneStatus): string {
    const details: string[] = [];

    // Core status information
    details.push(`Name: ${zone_status.zone_name}`);
    details.push(`Power: ${this.getZonePowerState(zone_status)}`);
    details.push(`Control: ${this.getZoneControlType(zone_status)}`);
    details.push(`Current: ${this.formatTemperature(zone_status.zone_temp)}`);
    details.push(`Target: ${this.formatTemperature(zone_status.zone_target)}`);
    details.push(`Damper: ${zone_status.zone_damper_position}%`);
    details.push(`Sensor: ${this.getZoneSensorStatus(zone_status)}`);

    // Warning conditions (only show if active)
    const batteryStatus = this.getZoneBatteryStatus(zone_status);
    if (batteryStatus === 'Low') {
      details.push(`⚠ Battery: ${batteryStatus}`);
    }

    const spillStatus = this.getZoneSpillStatus(zone_status);
    if (spillStatus === 'Active') {
      details.push(`⚠ Spill: ${spillStatus}`);
    }

    return details.join(', ');
  }

  /**
   * Convert AC power state code to human-readable string.
   * Maps protocol AC power state values to descriptive text.
   *
   * @param ac_status - AC status containing power state
   * @returns Human-readable power state
   */
  private getAcPowerState(ac_status: AcStatus): string {
    switch (ac_status.ac_power_state) {
      case 0: return 'Off';
      case 1: return 'On';
      case 2: return 'Away (Off)';   // Away mode with AC off
      case 3: return 'Away (On)';    // Away mode with AC on
      case 5: return 'Sleep';        // Sleep mode
      default: return `Unknown (${ac_status.ac_power_state})`;
    }
  }

  /**
   * Convert AC mode code to human-readable string.
   * Maps protocol AC mode values to descriptive text.
   *
   * @param ac_status - AC status containing mode
   * @returns Human-readable mode description
   */
  private getAcMode(ac_status: AcStatus): string {
    switch (ac_status.ac_mode) {
      case 0: return 'Auto';
      case 1: return 'Heat';
      case 2: return 'Dry';
      case 3: return 'Fan';
      case 4: return 'Cool';
      case 8: return 'Auto Heat';     // Automatic heating mode
      case 9: return 'Auto Cool';     // Automatic cooling mode
      default: return `Unknown (${ac_status.ac_mode})`;
    }
  }

  /**
   * Create a concise AC status summary for logging.
   * Provides key AC information in a compact format.
   *
   * @param ac_status - Complete AC status data
   * @returns Formatted status summary
   */
  private getAcStatusSummary(ac_status: AcStatus): string {
    const power = this.getAcPowerState(ac_status);
    const mode = this.getAcMode(ac_status);
    const temp = this.formatTemperature(ac_status.ac_temp);
    const target = this.formatTemperature(ac_status.ac_target);

    return `${power} | ${mode} | ${temp} → ${target}`;
  }
}