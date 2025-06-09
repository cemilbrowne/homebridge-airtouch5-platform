import { MAGIC } from './magic';
import { Logger } from 'homebridge';
import * as net from 'net';
import * as dgram from 'dgram';
import { EventEmitter } from 'events';

/**
 * Interface defining the capabilities and configuration of an AC unit
 * All properties are strings as they come directly from the device protocol
 */
export interface AcAbility {
  ac_unit_number: number;           // AC unit identifier (0-15)
  ac_name: string;                  // User-defined name for the AC unit
  ac_start_zone: number;            // First zone number controlled by this AC
  ac_zone_count: number;            // Number of zones controlled by this AC
  ac_support_cool_mode: number;     // Whether AC supports cooling (0/1)
  ac_support_fan_mode: number;      // Whether AC supports fan-only mode (0/1)
  ac_support_dry_mode: number;      // Whether AC supports dehumidify mode (0/1)
  ac_support_heat_mode: number;     // Whether AC supports heating (0/1)
  ac_support_auto_mode: number;     // Whether AC supports auto mode (0/1)
  ac_support_fan_intelligent: number; // Whether AC supports intelligent fan speed (0/1)
  ac_support_fan_turbo: number;     // Whether AC supports turbo fan speed (0/1)
  ac_support_fan_powerful: number;  // Whether AC supports powerful fan speed (0/1)
  ac_support_fan_high: number;      // Whether AC supports high fan speed (0/1)
  ac_support_fan_medium: number;    // Whether AC supports medium fan speed (0/1)
  ac_support_fan_low: number;       // Whether AC supports low fan speed (0/1)
  ac_support_fan_quiet: number;     // Whether AC supports quiet fan speed (0/1)
  ac_support_fan_auto: number;      // Whether AC supports auto fan speed (0/1)
  ac_min_cool: number;              // Minimum cooling temperature (°C)
  ac_max_cool: number;              // Maximum cooling temperature (°C)
  ac_min_heat: number;              // Minimum heating temperature (°C)
  ac_max_heat: number;              // Maximum heating temperature (°C)
}

/**
 * Interface defining the current status of an AC unit
 * All properties are strings as they come directly from the device protocol
 */
export interface AcStatus {
  ac_unit_number: number;   // AC unit identifier
  ac_power_state: number;   // Power state (0=off, 1=on, etc.)
  ac_mode: number;          // Operating mode (0=auto, 1=heat, 2=dry, 3=fan, 4=cool)
  ac_fan_speed: number;     // Current fan speed setting
  ac_target: number;        // Target temperature (°C)
  ac_temp: number;          // Current temperature reading (°C)
  ac_turbo: number;         // Turbo status (0/1)
  ac_bypass: number;        // Bypass status (0/1)
  ac_spill: number;         // Spill status (0/1)
  ac_timer: number;         // Timer status (0/1)
  ac_error_code: number;    // Error code (0 = no error)
}

/**
 * Interface for zone control parameters used in encode_zone_control()
 * Based on AirTouch 5 Protocol Specification Section 4.a.i (Zone control 0x20)
 */
export interface ZoneControlUnit {
  /**
   * Zone number (0-15)
   * Maps to Byte1 in protocol
   * Valid values: 0x00 – 0x0F (0-15)
   */
  zone_number?: number;

  /**
   * Zone power control
   * Maps to Byte2 bits 1-3 in protocol
   * Values from MAGIC.ZONE_POWER_STATES:
   * - 001: Change on/off state
   * - 010: Set to off
   * - 011: Set to on
   * - 101: Set to turbo
   * - Other: Keep power state
   */
  zone_power_state?: number;

  /**
   * Zone setting/target control type
   * Maps to Byte2 bits 6-8 in protocol
   * Values from MAGIC.ZONE_TARGET_TYPES:
   * - 010: Value decrease (-1°C/-5%)
   * - 011: Value increase (+1°C/+5%)
   * - 100: Set open percentage (0-100)
   * - 101: Set target setpoint (temperature)
   * - Other: Keep setting value
   */
  zone_target_type?: number;

  /**
   * Target value to set
   * Maps to Byte3 in protocol
   *
   * When setting percentage: 0-100 (damper opening percentage)
   * When setting temperature: 0-250, where setpoint = (value+100)/10 °C
   *
   * Examples:
   * - For 50% damper: zone_target = 50
   * - For 22°C: zone_target = (22*10)-100 = 120
   *
   * Other: Keep setting value (ignored)
   */
  zone_target?: number;
}


/**
 * Interface for AC control unit parameters used in encode_ac_control()
 * Based on AirTouch 5 Protocol Specification Section 4.a.iii (AC control 0x22)
 */
export interface AcControlUnit {
  /**
   * AC unit number (0-7)
   * Maps to Byte1 bits 1-4 in protocol
   */
  ac_unit_number?: number;

  /**
   * Power state control
   * Maps to Byte1 bits 5-8 in protocol
   * Values from MAGIC.AC_POWER_STATES:
   * - 0001: Change on/off status
   * - 0010: Set to off
   * - 0011: Set to on
   * - 0100: Set to away
   * - 0101: Set to sleep
   * - Other: Keep power setting
   */
  ac_power_state?: number;

  /**
   * Fan speed setting
   * Maps to Byte2 bits 1-4 in protocol
   * Values from MAGIC.AC_FAN_SPEEDS:
   * - 0000: Set to auto
   * - 0001: Set to quiet
   * - 0010: Set to low
   * - 0011: Set to medium
   * - 0100: Set to high
   * - 0101: Set to powerful
   * - 0110: Set to turbo
   * - 1000: Set to Intelligent Auto
   * - Other: Keep fan speed setting
   */
  ac_fan_speed?: number;

  /**
   * AC operating mode
   * Maps to Byte2 bits 5-8 in protocol
   * Values from MAGIC.AC_MODES:
   * - 0000: Set to auto
   * - 0001: Set to heat
   * - 0010: Set to dry
   * - 0011: Set to fan
   * - 0100: Set to cool
   * - Other: Keep mode setting
   */
  ac_mode?: number;

  /**
   * Target temperature control type
   * Maps to Byte3 in protocol (upper 4 bits only)
   * Values from MAGIC.AC_TARGET_TYPES:
   * - 0x40: Change setpoint
   * - 0x00: Keep setpoint value
   * - Other: Invalidate data
   */
  ac_target_keep?: number;

  /**
   * Target temperature value (protocol format)
   * Maps to Byte4 in protocol
   * Only used when ac_target_keep is 0x40
   *
   * Formula: protocol_value = (celsius_temp * 10) - 100
   * Example: For 22°C: (22 * 10) - 100 = 120
   * Controller converts back: (120 + 100) / 10 = 22°C
   *
   * Valid range: 10.0°C to 35.0°C (protocol values: 0 to 250)
   */
  ac_target_value?: number;
}

/**
 * Interface defining the current status of a zone
 * All properties are strings as they come directly from the device protocol
 */
export interface ZoneStatus {
  zone_number: number;          // Zone identifier (0-15)
  zone_name: string;           // User-defined zone name (optional)
  zone_power_state: number;     // Zone power state (0=off, 1=on)
  zone_control_type: number;    // Control type (0=percentage, 1=temperature)
  zone_damper_position: number; // Damper opening percentage (0-100)
  zone_target: number;          // Target temperature for zone (°C)
  zone_temp: number;            // Current zone temperature (°C)
  zone_battery_low: number;     // Battery low indicator for wireless sensor (0/1)
  zone_has_sensor: number;      // Whether zone has temperature sensor (0/1)
  zone_has_spill: number;       // Whether zone has spill capability (0/1)
}

/**
 * Main API class for communicating with AirTouch 5 controller
 * Handles TCP connection, message encoding/decoding, and device discovery
 */
export class AirtouchAPI {
  log: Logger;                    // Homebridge logger instance
  device: net.Socket = new net.Socket;             // TCP socket connection to AirTouch controller
  emitter: EventEmitter;          // Event emitter for notifying platform of updates
  lastDataTime: number;           // Timestamp of last received data (for connection monitoring)
  got_ac_ability: boolean;        // Flag indicating if AC capabilities have been received
  got_zone_status: boolean;       // Flag indicating if zone status has been received
  public readonly ip: string;           // IP address of AirTouch controller
  public readonly consoleId: string;    // Console ID from device discovery
  public readonly AirtouchId: string;   // Unique AirTouch device identifier
  public readonly deviceName: string;   // Human-readable device name

  /**
   * TCP socket client for the Airtouch Touchpad Controller
   * Listens and decodes broadcast messages containing AC and Group states
   * Encodes and sends messages containing AC and Group commands
   */
  constructor (ip: string, consoleId: string, AirtouchId: string, deviceName: string, log: Logger, emitter: EventEmitter) {
    this.log = log;
    this.emitter = emitter;
    this.ip = ip;
    this.consoleId = consoleId;
    this.AirtouchId = AirtouchId;
    this.deviceName = deviceName;
    this.lastDataTime = Date.now();
    this.got_ac_ability = false;
    this.got_zone_status = false;
  }

  /**
   * Static method to discover AirTouch devices on the network via UDP broadcast
   * Sends discovery request and listens for responses containing device information
   * @param log - Logger instance for debug output
   * @param myemitter - EventEmitter to notify when devices are found
   */
  static async discoverDevices(log: Logger, myemitter: EventEmitter): Promise<void> {
    // Standard AirTouch discovery message
    const message = Buffer.from('::REQUEST-POLYAIRE-AIRTOUCH-DEVICE-INFO:;');
    const socket = dgram.createSocket('udp4');

    // Listen for device responses
    socket.on('message', (message) => {
      // Ignore our own broadcast message
      if(message.toString() !== '::REQUEST-POLYAIRE-AIRTOUCH-DEVICE-INFO:;') {
        // Parse response: IP,ConsoleID,,AirtouchID,DeviceName
        const messages = message.toString().split(',');
        const ip = messages[0];
        const consoleId = messages[1];
        const AirtouchId = messages[3];
        const deviceName = messages[4];

        log.debug('APIDISC | Found device on ip: '+ip+' with consoleId: '+consoleId);
        myemitter.emit('found_devices', ip, consoleId, AirtouchId, deviceName);
      }
    });

    // Bind to discovery port and send broadcast
    socket.bind(49005);
    socket.on('listening', () => {
      socket.setBroadcast(true);

      // Set discovery timeout (5 seconds)
      setTimeout(() => {
        log.debug('APIDISC | Done looking for devices.');
        try {
          socket.close();
        } catch (err) {
          log.debug('Unable to close socket.');
        }
      }, 5000);

      log.debug('APIDISC | Starting to search for AirTouch5 Devices.');
      socket.send(message, 0, message.length, 49005, '255.255.255.255');
    });
  }

  /**
   * Calculate CRC16 checksum for message validation
   * Uses Modbus CRC16 algorithm as required by AirTouch protocol
   * Implementation from https://github.com/yuanxu2017/modbus-crc16
   * @param buffer - Data buffer to calculate checksum for
   * @returns CRC16 checksum value
   */
  crc16(buffer: Buffer): number {
    let crc = 0xFFFF;
    let odd: number;

    for (let i = 0; i < buffer.length; i++) {
      crc = crc ^ buffer[i];

      for (let j = 0; j < 8; j++) {
        odd = crc & 0x0001;
        crc = crc >> 1;
        if (odd) {
          crc = crc ^ 0xA001;
        }
      }
    }
    return crc;
  }

  /**
   * Utility function to provide default values for undefined parameters
   * Uses TypeScript generics for type safety while maintaining flexibility
   * @param val - Value to check (can be undefined)
   * @param nullVal - Default value to return if val is undefined
   * @returns val if defined, nullVal otherwise
   */
  isNull<T>(val: T | undefined, nullVal: T): T {
    return val === undefined ? nullVal : val;
  }

  /**
   * Log AcControlUnit interface data in a clean, single-line format
   * @param control - AcControlUnit object to log
   * @returns Formatted string for logging
   */
  logAcControlUnit(control: AcControlUnit): string {
    const parts: string[] = [];

    // AC unit number
    if (control.ac_unit_number !== undefined) {
      parts.push(`AC${control.ac_unit_number}`);
    }

    // Power state with readable description
    if (control.ac_power_state !== undefined) {
      const powerMap: { [key: number]: string } = {
        1: 'Toggle', 2: 'Off', 3: 'On', 4: 'Away', 5: 'Sleep',
      };
      const powerDesc = powerMap[control.ac_power_state] || `Power(${control.ac_power_state})`;
      parts.push(`Pwr:${powerDesc}`);
    }

    // Mode with readable description
    if (control.ac_mode !== undefined) {
      const modeMap: { [key: number]: string } = {
        0: 'Auto', 1: 'Heat', 2: 'Dry', 3: 'Fan', 4: 'Cool',
      };
      const modeDesc = modeMap[control.ac_mode] || `Mode(${control.ac_mode})`;
      parts.push(`Mode:${modeDesc}`);
    }

    // Fan speed with readable description
    if (control.ac_fan_speed !== undefined) {
      const fanMap: { [key: number]: string } = {
        0: 'Auto', 1: 'Quiet', 2: 'Low', 3: 'Med', 4: 'High', 5: 'Powerful', 6: 'Turbo', 8: 'Intelligent',
      };
      const fanDesc = fanMap[control.ac_fan_speed] || `Fan(${control.ac_fan_speed})`;
      parts.push(`Fan:${fanDesc}`);
    }

    // Target temperature control and value
    if (control.ac_target_keep !== undefined) {
      if (control.ac_target_keep === 0x40 && control.ac_target_value !== undefined) {
        // Convert protocol value back to Celsius: (value + 100) / 10
        const tempCelsius = ((control.ac_target_value + 100) / 10).toFixed(1);
        parts.push(`Target:${tempCelsius}°C`);
      } else if (control.ac_target_keep === 0x00) {
        parts.push('Target:Keep');
      } else {
        parts.push(`Target:Invalid(${control.ac_target_keep})`);
      }
    }

    return parts.length > 0 ? parts.join(' | ') : 'AcControlUnit: Empty';
  }

  /**
   * Log ZoneControlUnit interface data in a clean, single-line format
   * @param control - ZoneControlUnit object to log
   * @returns Formatted string for logging
   */
  logZoneControlUnit(control: ZoneControlUnit): string {
    const parts: string[] = [];

    // Zone number
    if (control.zone_number !== undefined) {
      parts.push(`Zone ${control.zone_number}`);
    }

    // Power state with readable description
    if (control.zone_power_state !== undefined) {
      const powerMap: { [key: number]: string } = {
        1: 'Toggle', 2: 'Off', 3: 'On', 5: 'Turbo',
      };
      const powerDesc = powerMap[control.zone_power_state] || `Power(${control.zone_power_state})`;
      parts.push(`Pwr: ${powerDesc}`);
    }

    // Target type and value combined for clarity
    if (control.zone_target_type !== undefined) {
      const targetTypeMap: { [key: number]: string } = {
        2: 'Decrease', 3: 'Increase', 4: 'SetPercent', 5: 'SetTemp',
      };
      const targetTypeDesc = targetTypeMap[control.zone_target_type] || `Target(${control.zone_target_type})`;
      if (control.zone_target !== undefined) {
        // Format the target value based on the target type
        let targetValue = '';

        if (control.zone_target_type === 4) {
          // Setting percentage (0-100)
          targetValue = `${control.zone_target}%`;
        } else if (control.zone_target_type === 5) {
          // Setting temperature: convert protocol value back to Celsius
          // Protocol: setpoint = (value+100)/10, so value = (setpoint*10)-100
          const tempCelsius = ((control.zone_target + 100) / 10).toFixed(1);
          targetValue = `${tempCelsius}°C`;
        } else if (control.zone_target_type === 2 || control.zone_target_type === 3) {
          // Increase/Decrease - value is typically ignored but show if present
          targetValue = control.zone_target !== 0 ? `(${control.zone_target})` : '';
        } else {
          // Unknown target type - show raw value
          targetValue = `(${control.zone_target})`;
        }

        parts.push(`${targetTypeDesc}:${targetValue}`);
      } else {
        parts.push(targetTypeDesc);
      }
    } else if (control.zone_target !== undefined) {
      // Target value without type - ambiguous, show raw value
      parts.push(`Target: ${control.zone_target}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'ZoneControlUnit: Empty';
  }

  /**
   * Assemble an extended message packet for complex requests
   * Extended messages are used for getting AC abilities and zone names
   * @param data - Command data to include in message
   * @returns Complete message buffer ready for transmission
   */
  assemble_extended_message(data: Buffer): Buffer {
    // this.log.debug('API     | Assembling extended message to get information');

    // Standard extended message header
    const startbuf = Buffer.from([...MAGIC.ADDRESS_EXTENDED_BYTES, 0x01, MAGIC.MSGTYPE_EXTENDED]);
    const databuf = Buffer.from([...data]);

    // Message length (big-endian)
    const datalen = Buffer.alloc(2);
    datalen.writeUInt16BE(databuf.length);

    // Combine all parts
    const finalbuf = Buffer.concat([startbuf, datalen, databuf]);
    return finalbuf;
  }

  /**
   * Assemble a standard message packet for regular commands
   * Standard messages are used for status requests and control commands
   * @param type - Message type identifier
   * @param data - Command data to include in message
   * @returns Complete message buffer ready for transmission
   */
  assemble_standard_message(type: number, data: Buffer): Buffer {
    // this.log.debug('API     | Assembling standard message with type ' + type.toString(16));

    // Standard message header
    const startbuf = Buffer.from([...MAGIC.ADDRESS_STANDARD_BYTES, 0x01, MAGIC.MSGTYPE_STANDARD]);

    // Message data with type and padding
    const databuf = Buffer.from([...[type], 0x00, 0x00, 0x00, ...data]);

    // Message length (big-endian)
    const datalen = Buffer.alloc(2);
    datalen.writeUInt16BE(databuf.length);

    // Combine all parts
    const finalbuf = Buffer.concat([startbuf, datalen, databuf]);
    return finalbuf;
  }

  /**
   * Decode extended message responses from AirTouch controller
   * Extended messages contain AC abilities, errors, and zone names
   * @param data - Raw message data from controller
   */
  decode_extended_message(data: Buffer): void {
    // Extract message subtype from fixed position in protocol
    const message_type = data.subarray(11, 12);

    if(message_type[0] === MAGIC.EXT_SUBTYPE_AC_ABILITY) {
      //this.log.debug('API     | Got Extended message - AC ABILITY');
      this.decode_ac_ability(data.subarray(12, data.length-2));
    } else if (message_type[0] === MAGIC.EXT_SUBTYPE_AC_ERROR) {
      //this.log.debug('API     | Got Extended message - AC ERROR');
      // TODO: Implement AC error handling
    } else if (message_type[0] === MAGIC.EXT_SUBTYPE_ZONE_NAME) {
      //this.log.debug('API     | Got Extended message - ZONE NAMES');
      this.decode_zone_names(data.subarray(12, data.length-2));
    } else {
      // Unknown extended message types are not necessarily errors
      // The protocol may have additional message types we don't handle
    }
  }

  /**
   * Decode standard message responses from AirTouch controller
   * Standard messages contain AC status and zone status information
   * @param data - Raw message data from controller
   */
  decode_standard_message(data: Buffer): void {
    // Extract message subtype from fixed position in protocol
    const message_type = data.subarray(10, 11);

    // Extract repeat data information for handling multiple AC/zone records
    const repeat_data_length = data.subarray(14, 16).readUInt16BE();
    const count_repeats = data.subarray(16, 18).readUInt16BE();

    if(message_type[0] === MAGIC.SUBTYPE_ZONE_STAT) {
      this.decode_zones_status(count_repeats, repeat_data_length, data.subarray(18, data.length-2));
    } else if (message_type[0] === MAGIC.SUBTYPE_AC_STAT) {
      this.decode_ac_status(count_repeats, repeat_data_length, data.subarray(18, data.length-2));
    } else {
      // Unknown standard message types are not necessarily errors
    }
  }

  /**
   * Send a message to the AirTouch controller via TCP
   * Adds protocol header and CRC checksum before transmission
   * @param data - Message data to send (without header/checksum)
   */
  send(data: Buffer): void {
    // Calculate and add CRC16 checksum
    const crc = Buffer.alloc(2);
    crc.writeUInt16BE(this.crc16(data));

    // Assemble complete message with header and checksum
    const message = Buffer.from([...MAGIC.HEADER_BYTES, ...data, ...crc]);

    // Send via TCP socket
    this.device.write(message);
  }

  /**
   * ENCODE AC CONTROL - Based on AirTouch 5 Protocol Specification (Section 4.a.iii)
   *
   * This method implements the exact AC control message format specified in the
   * AirTouch 5 Communication Protocol document (page 8-9).
   *
   * PROTOCOL CONTEXT:
   * - Message Type: 0xC0 (Control command and status message)
   * - Sub Type: 0x22 (AC control)
   * - Each repeat data: 4 bytes per AC unit
   * - This method creates those 4 bytes of repeat data
   *
   * THE 4-BYTE AC CONTROL FORMAT (from protocol spec):
   * ┌─────────┬─────────────────────────────────────────────────────────────┐
   * │ Byte 1  │ Bit8-5: Power setting    │ Bit4-1: AC number (0-7)        │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 2  │ Bit8-5: AC mode          │ Bit4-1: AC fan speed           │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 3  │ Setpoint control (0x40=change, 0x00=keep)                  │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 4  │ Setpoint value (when Byte3=0x40): (data+100)/10 = °C      │
   * └─────────┴─────────────────────────────────────────────────────────────┘
   */
  encode_ac_control(unit: AcControlUnit): Buffer {

    // BYTE 1: AC Number (bits 1-4) + Power Setting (bits 5-8)
    // ═══════════════════════════════════════════════════════════════════════
    // AC Number: 0-7 (which AC unit to control)
    let byte1 = this.isNull(unit.ac_unit_number, MAGIC.AC_UNIT_DEFAULT);

    // Power Setting (upper 4 bits): According to protocol spec:
    // 0001: Change on/off status  0010: Set to off      0011: Set to on
    // 0100: Set to away          0101: Set to sleep     Other: Keep power setting
    byte1 = byte1 | ((this.isNull(unit.ac_power_state, MAGIC.AC_POWER_STATES.KEEP)) << 4);

    // BYTE 2: Fan Speed (bits 1-4) + AC Mode (bits 5-8)
    // ═══════════════════════════════════════════════════════════════════════
    // Fan Speed (lower 4 bits): According to protocol spec:
    // 0000: Set to auto     0001: Set to quiet    0010: Set to low
    // 0011: Set to medium   0100: Set to high     0101: Set to powerful
    // 0110: Set to turbo    1000: Set to Intelligent Auto
    // Other: Keep fan speed setting
    let byte2 = this.isNull(unit.ac_fan_speed, MAGIC.AC_FAN_SPEEDS.KEEP);

    // AC Mode (upper 4 bits): According to protocol spec:
    // 0000: Set to auto    0001: Set to heat     0010: Set to dry
    // 0011: Set to fan     0100: Set to cool     Other: Keep mode setting
    byte2 = byte2 | ((this.isNull(unit.ac_mode, MAGIC.AC_MODES.KEEP)) << 4);

    // BYTE 3: Setpoint Control
    // ═══════════════════════════════════════════════════════════════════════
    // According to protocol spec:
    // 0x40: Change setpoint    0x00: Keep setpoint value    Other: Invalidate data
    // Note: Only upper 4 bits are used, lower 4 bits are unused/reserved
    const byte3 = (this.isNull(unit.ac_target_keep, MAGIC.AC_TARGET_TYPES.KEEP) << 4);

    // BYTE 4: Setpoint Value
    // ═══════════════════════════════════════════════════════════════════════
    // According to protocol spec:
    // "Available when byte3 is 0x40. Setpoint = (data+100)/10. Range [10.0-35.0]"
    // So to set 22°C: (22*10)-100 = 120, and controller does (120+100)/10 = 22°C
    const byte4 = this.isNull(unit.ac_target_value, MAGIC.AC_TARGET_DEFAULT);

    // Return the 4-byte control message as specified in protocol
    return Buffer.from([byte1, byte2, byte3, byte4]);
  }


  /**
   * Send command to turn AC unit on or off
   * @param unit_number - AC unit identifier (0-15)
   * @param active - true to turn on, false to turn off
   */
  acSetActive(unit_number: number, active: boolean): void {
    const target: AcControlUnit = {
      ac_unit_number: unit_number,
      ac_power_state: active ? MAGIC.AC_POWER_STATES.ON : MAGIC.AC_POWER_STATES.OFF,
    };
    this.log.debug('API     | Setting AC Active.  Full Control Layout: %s', this.logAcControlUnit(target));
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  /**
   * Send command to change AC target temperature
   * @param unit_number - AC unit identifier (0-15)
   * @param value - Target temperature in Celsius
   */
  acSetTargetTemperature(unit_number: number, value: number): void {
    const target:AcControlUnit = {
      ac_unit_number: unit_number,
      ac_target_keep: MAGIC.AC_TARGET_TYPES.SET_VALUE,
      ac_target_value: (value*10)-100,  // Convert to protocol format
    };
    this.log.debug('API     | Setting AC temperature.  Full Control Layout: %s', this.logAcControlUnit(target));
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  /**
   * Send command to change AC heating/cooling mode
   * @param unit_number - AC unit identifier (0-7)
   * @param state - Target state (OFF/HEAT/COOL/AUTO)
   */
  acSetTargetHeatingCoolingState(unit_number: number, state: number): void {

    // Declare target and assign based on state
    let target: AcControlUnit;

    switch (state) {
      case MAGIC.AC_TARGET_STATES.OFF: // Turn AC off
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.OFF,
        };
        break;

      case MAGIC.AC_TARGET_STATES.HEAT: // Set to heating mode
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.HEAT,
        };
        break;

      case MAGIC.AC_TARGET_STATES.COOL: // Set to cooling mode
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.COOL,
        };
        break;

      case MAGIC.AC_TARGET_STATES.AUTO: // Set to auto mode
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.AUTO,
        };
        break;

      default:
        // Handle invalid state - log error and exit early
        this.log.error('API | Invalid heating/cooling state: ' + state);
        return; // Exit early if invalid state - target never used after this
    }

    // TypeScript now knows target is definitely assigned because all valid paths assign it
    // and invalid paths return early
    this.log.debug('API     | Setting AC heating/cooling state.  Full Control Layout: %s', this.logAcControlUnit(target));
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  /**
   * Send command to change AC fan speed
   * @param unit_number - AC unit identifier (0-15)
   * @param speed - Fan speed setting (0=auto, 1=quiet, 2=low, etc.)
   */
  acSetFanSpeed(unit_number: number, speed: number): void {
    const target = {
      ac_unit_number: unit_number,
      ac_fan_speed: speed,
    };
    this.log.debug('API     | Setting AC fan speed.  Full Control Layout: %s', this.logAcControlUnit(target));
    const data = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  /**
   * Decode zone name information from extended message
   * Zone names are variable length and packed sequentially in the message
   * @param data - Raw zone name data from controller
   */
  decode_zone_names(data: Buffer): void {
    const length = data.length;
    if(length > 0) {
      let counter = 0;
      while (counter < length) {
        // Each zone name record: [zone_number][name_length][name_bytes...]
        const zone_number = data[counter];
        const zone_name_length = data[counter+1];
        const zone_name = data.subarray(counter+2, counter+2+zone_name_length).toString();
        counter = counter + 2 + zone_name_length;

        // Emit zone name event for platform processing
        this.emitter.emit('zone_name', zone_number, zone_name, this.AirtouchId);
      }
    }
  }

  /**
   * Decode AC ability/capability information from extended message
   * Contains AC configuration, supported modes, temperature ranges, etc.
   * @param data - Raw AC ability data from controller
   */
  decode_ac_ability(data: Buffer): void {
    const length = data.length;
    const count_repeats = length/MAGIC.LENGTH_AC_ABILITY;

    // Process each AC unit's abilities (26 bytes per unit)
    for (let i = 0; i < count_repeats; i++) {
      const unit = data.subarray(i*MAGIC.LENGTH_AC_ABILITY, i*MAGIC.LENGTH_AC_ABILITY+MAGIC.LENGTH_AC_ABILITY);

      // Extract basic AC information
      const ac_unit_number = unit[0];

      // AC name is null-terminated string at bytes 2-17
      const ac_name_temp = unit.subarray(2, 18).toString();
      let ac_name = '';
      const c = ac_name_temp.indexOf('\0');
      if (c>-1) {
        ac_name = ac_name_temp.substring(0, c);
      } else {
        ac_name = ac_name_temp;
      }

      // Zone configuration
      const ac_start_zone = unit[18];
      const ac_zone_count = unit[19];

      // Supported operating modes (bit flags in byte 20)
      const ac_support_cool_mode = (unit[20] & 0b00010000) >> 4;
      const ac_support_fan_mode = (unit[20] & 0b00001000) >> 3;
      const ac_support_dry_mode = (unit[20] & 0b00000100) >> 2;
      const ac_support_heat_mode = (unit[20] & 0b00000010) >> 1;
      const ac_support_auto_mode = (unit[20] & 0b00000001);

      // Supported fan speeds (bit flags in byte 21)
      const ac_support_fan_intelligent = (unit[21] & 0b10000000) >> 7;
      const ac_support_fan_turbo = (unit[21] & 0b01000000) >> 6;
      const ac_support_fan_powerful = (unit[21] & 0b00100000) >> 5;
      const ac_support_fan_high = (unit[21] & 0b00010000) >> 4;
      const ac_support_fan_medium = (unit[21] & 0b00001000) >> 3;
      const ac_support_fan_low = (unit[21] & 0b00000100) >> 2;
      const ac_support_fan_quiet = (unit[21] & 0b00000010) >> 1;
      const ac_support_fan_auto = (unit[21] & 0b00000001);

      // Temperature ranges
      const ac_min_cool = unit[22];
      const ac_max_cool = unit[23];
      const ac_min_heat = unit[24];
      const ac_max_heat = unit[25];

      // Build AC ability object
      const to_push = {
        ac_unit_number: ac_unit_number,
        ac_name: ac_name,
        ac_start_zone: ac_start_zone,
        ac_zone_count: ac_zone_count,
        ac_support_cool_mode: ac_support_cool_mode,
        ac_support_fan_mode: ac_support_fan_mode,
        ac_support_dry_mode: ac_support_dry_mode,
        ac_support_heat_mode: ac_support_heat_mode,
        ac_support_auto_mode: ac_support_auto_mode,
        ac_support_fan_intelligent: ac_support_fan_intelligent,
        ac_support_fan_turbo: ac_support_fan_turbo,
        ac_support_fan_powerful: ac_support_fan_powerful,
        ac_support_fan_high: ac_support_fan_high,
        ac_support_fan_medium: ac_support_fan_medium,
        ac_support_fan_low: ac_support_fan_low,
        ac_support_fan_quiet: ac_support_fan_quiet,
        ac_support_fan_auto: ac_support_fan_auto,
        ac_min_cool: ac_min_cool,
        ac_max_cool: ac_max_cool,
        ac_min_heat: ac_min_heat,
        ac_max_heat: ac_max_heat,
      };

      // Emit AC ability event for platform processing
      this.emitter.emit('ac_ability', to_push, this.AirtouchId);
    }

    // Once we have AC abilities, we can request status information
    this.got_ac_ability = true;
    this.GET_AC_STATUS();
    this.GET_ZONE_STATUS();
  }

  /**
   * Decode AC status information from standard message
   * Contains current AC operating state, temperatures, settings, etc.
   * @param count_repeats - Number of AC units in message
   * @param data_length - Length of each AC record (8 bytes)
   * @param data - Raw AC status data
   */
  decode_ac_status(count_repeats: number, data_length: number, data: Buffer): void {
    // Process each AC unit's status (8 bytes per unit)
    for (let i = 0; i < count_repeats; i++) {
      const unit = data.subarray(i*19, i*10+10);

      // Extract bit-packed status information
      const ac_power_state = (unit[0] & 0b11110000) >> 4;    // Upper 4 bits
      const ac_unit_number = unit[0] & 0b00001111;           // Lower 4 bits
      const ac_mode = (unit[1] & 0b11110000) >> 4;           // Upper 4 bits
      const ac_fan_speed = unit[1] & 0b00001111;             // Lower 4 bits
      const ac_turbo = (unit[3] & 0b00001000) >> 3;
      const ac_bypass = (unit[3] & 0b00000100) >> 2;
      const ac_spill = (unit[3] & 0b00000010) >> 1;          // Bit 1
      const ac_timer = (unit[3] & 0b00000001);               // Bit 0

      // Temperature values (with protocol-specific scaling)
      const ac_target = (unit[2] + 100.0) / 10.0;  // Target temp
      const ac_temp = ((((unit[4] & 0b00000111) << 8) + ((unit[5]))) - 500) / 10; // Current temp
      // Error code (16-bit value)
      const ac_error_code = (unit[6] << 8) + (unit[7]);

      // Build AC status object
      const to_push = {
        ac_unit_number: ac_unit_number,
        ac_power_state: ac_power_state,
        ac_mode: ac_mode,
        ac_fan_speed: ac_fan_speed,
        ac_target: ac_target,
        ac_temp: ac_temp,
        ac_turbo: ac_turbo,
        ac_bypass: ac_bypass,
        ac_spill: ac_spill,
        ac_timer: ac_timer,
        ac_error_code: ac_error_code,
      };

      // Emit AC status event for platform processing
      this.emitter.emit('ac_status', to_push, this.AirtouchId);
    }
  }

  /**
   * Decode zone status information from standard message
   * Contains current zone operating state, temperatures, damper positions, etc.
   * @param count_repeats - Number of zones in message
   * @param data_length - Length of each zone record (8 bytes)
   * @param data - Raw zone status data
   */
  decode_zones_status(count_repeats: number, data_length: number, data: Buffer): void {
    // Process each zone's status (8 bytes per zone)
    for (let i = 0; i < count_repeats; i++) {
      const group = data.subarray(i*8, i*8+8);

      // Extract bit-packed status information
      const zone_power_state = (group[0] & 0b11000000) >> 6;  // Upper 2 bits
      const zone_number = group[0] & 0b00111111;              // Lower 6 bits
      const zone_control_type = (group[1] & 0b10000000) >> 7; // Bit 7
      const zone_open_perc = group[1] & 0b01111111;           // Lower 7 bits (damper %)

      // Temperature values (with protocol-specific scaling)
      const zone_target = ((group[2])+100.0)/10.0;           // Target temperature
      const zone_has_sensor = (group[3] & 0b10000000) >> 7;  // Bit 7
      const zone_temp = (((group[4] << 8) + ((group[5]))) - 500) / 10; // Current temp

      // Status flags
      const zone_has_spill = (group[6] & 0b00000010) >> 1;   // Bit 1
      const zone_battery_low = (group[6] & 0b00000001);      // Bit 0

      // Build zone status object
      const to_push = {
        zone_number: zone_number,
        zone_power_state: zone_power_state,
        zone_control_type: zone_control_type,
        zone_damper_position: zone_open_perc,
        zone_target: zone_target,
        zone_temp: zone_temp,
        zone_battery_low: zone_battery_low,
        zone_has_sensor: zone_has_sensor,
        zone_has_spill: zone_has_spill,
      };

      // Note: For testing, zone_has_sensor can be forced to 0
      // to_push.zone_has_sensor = 0;

      // Emit zone status event for platform processing
      this.emitter.emit('zone_status', to_push, this.AirtouchId);
    }

    // Once we have zone status, we can request zone names
    if(this.got_zone_status === false) {
      this.got_zone_status = true;
      this.GET_ZONE_NAMES();
    }
  }

  /**
   * Encode zone control parameters into protocol format
   * Packs zone control parameters into 4-byte message format according to
   * AirTouch 5 Protocol Specification Section 4.a.i (Zone control 0x20)
   *
   * PROTOCOL FORMAT:
   * ┌─────────┬─────────────────────────────────────────────────────────────┐
   * │ Byte 1  │ Zone number (0-15)                                          │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 2  │ Bit8-6: Zone setting    │ Bit5-4: Keep0  │ Bit3-1: Power │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 3  │ Value to Set (0-100 for %, 0-250 for temp)                 │
   * ├─────────┼─────────────────────────────────────────────────────────────┤
   * │ Byte 4  │ Keep 0 (Reserved)                                           │
   * └─────────┴─────────────────────────────────────────────────────────────┘
   *
   * @param zone - Object containing zone control parameters
   * @returns Encoded 4-byte control message
   */
  encode_zone_control(zone: ZoneControlUnit): Buffer {
    // BYTE 1: Zone Number (0-15)
    // ═══════════════════════════════════════════════════════════════════════
    // Direct mapping - which zone to control (0-15)
    const byte1 = this.isNull(zone.zone_number, MAGIC.ZONE_NUMBER_DEFAULT);

    // BYTE 2: Zone Setting Type (bits 6-8) + Power State (bits 1-3)
    // ═══════════════════════════════════════════════════════════════════════
    // Power State (lower 3 bits): According to protocol spec:
    // 001: Change on/off state  010: Set to off    011: Set to on
    // 101: Set to turbo        Other: Keep power state
    let byte2 = this.isNull(zone.zone_power_state, MAGIC.ZONE_POWER_STATES.KEEP);

    // Zone Setting Type (upper 3 bits, shifted to position 6-8):
    // 010: Value decrease (-1°C/-5%)    011: Value increase (+1°C/+5%)
    // 100: Set open percentage          101: Set target setpoint
    // Other: Keep setting value
    // Note: Bits 4-5 are always 0 (Keep0 in protocol spec)
    byte2 = byte2 | ((this.isNull(zone.zone_target_type, MAGIC.ZONE_TARGET_TYPES.KEEP)) << 5);

    // BYTE 3: Target Value
    // ═══════════════════════════════════════════════════════════════════════
    // When set percentage: 0-100 (direct percentage value)
    // When set temperature: 0-250, where setpoint=(value+100)/10 in °C
    // Other: Keep setting value (value ignored)
    const byte3 = zone.zone_target || 0;

    // BYTE 4: Reserved
    // ═══════════════════════════════════════════════════════════════════════
    // Always 0 according to protocol specification
    const byte4 = 0;

    return Buffer.from([byte1, byte2, byte3, byte4]);
  }


  /**
   * Send command to turn zone on or off
   * @param zone_number - Zone identifier (0-15)
   * @param active - true to turn on, false to turn off
   */
  zoneSetActive(zone_number: number, active: boolean): void {
    const target: ZoneControlUnit = {
      zone_number: zone_number,
      zone_power_state: active ? MAGIC.ZONE_POWER_STATES.ON : MAGIC.ZONE_POWER_STATES.OFF,
    };
    this.log.debug('API     | Setting zone state.  Full Control Layout: %s', this.logZoneControlUnit(target));
    const data: Buffer = this.encode_zone_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  /**
   * Send command to change zone damper percentage
   * @param zone_number - Zone identifier (0-15)
   * @param value - Damper opening percentage (0-100)
   */
  zoneSetPercentage(zone_number: number, value: number): void {
    const target: ZoneControlUnit = {
      zone_number: zone_number,
      zone_power_state: MAGIC.ZONE_POWER_STATES.ON,
      zone_target_type: MAGIC.ZONE_TARGET_TYPES.DAMPER,
      zone_target: value,
    };
    this.log.debug('API     | Setting zone percentage.  Full Control Layout: %s', this.logZoneControlUnit(target));
    const data: Buffer = this.encode_zone_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  /**
   * Send command to set zone target temperature
   * @param zone_number - Zone identifier (0-15)
   * @param temp - Target temperature in Celsius
   */
  zoneSetTargetTemperature(zone_number: number, temp: number): void {
    const target: ZoneControlUnit = {
      zone_number: zone_number,
      zone_power_state: MAGIC.ZONE_POWER_STATES.ON,
      zone_target_type: MAGIC.ZONE_TARGET_TYPES.TEMPERATURE,
      zone_target: temp*10-100,  // Convert to protocol format
    };
    this.log.debug('API     | Setting zone temperature.  Full Control Layout: %s', this.logZoneControlUnit(target));
    const data: Buffer = this.encode_zone_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  /**
   * Request current AC status from controller
   * Only sends request if AC abilities have been received first
   */
  GET_AC_STATUS(): void {
    if(this.got_ac_ability === true) {
      const data = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_STAT, data);
      this.send(message);
    }
  }

  /**
   * Request AC abilities/capabilities from controller
   * This is typically the first request sent after connection
   */
  GET_AC_ABILITY(): void {
    const data = Buffer.from([0xff, 0x11, 0x00]);
    const message = this.assemble_extended_message(data);
    this.send(message);
  }

  /**
   * Request current zone status from controller
   * Sends request with dummy data due to protocol requirement
   */
  GET_ZONE_STATUS(): void {
    // Due to a protocol bug, cannot send empty data
    // so we send 4 bytes of data instead
    const data = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_STAT, data);
    this.send(message);
  }

  /**
   * Request zone names from controller
   * Only sends request if zone status has been received first
   */
  GET_ZONE_NAMES(): void {
    if(this.got_zone_status === true) {
      const data = Buffer.from([0xff, 0x13]);
      const message = this.assemble_extended_message(data);
      this.send(message);
    }
  }

  /**
   * Monitor connection health by checking last received data timestamp
   * Triggers reconnection if no data received for 2 minutes
   */
  checkLastDateReceived(): void {
    const currDate = Date.now();
    const diff = Math.floor((currDate - this.lastDataTime)/1000);

    if(diff > 120) { // 2 minutes timeout
      this.log.debug('API     | Went past the expected time to receive a message. This may not be an error message if the AC is off.');
      this.device.destroy();
      this.log.debug('API     | Attempting reconnect');
      this.emitter.emit('attempt_reconnect', this.AirtouchId);
    }
  }

  /**
   * Establish TCP connection to AirTouch controller
   * Sets up event handlers for data, error, and connection events
   */
  connect(): void {
    // this.log.debug('API     | Beginning connection to: ' + this.ip);
    this.device = new net.Socket();

    // Establish connection to AirTouch controller (port 9005)
    this.device.connect(9005, this.ip, () => {
      this.log.debug('API     | Connected to Airtouch: %s', this.ip);
      // Request AC abilities immediately after connection
      this.GET_AC_ABILITY();
    });

    // Initialize connection monitoring
    this.lastDataTime = Date.now();

    // Handle connection close
    this.device.on('close', () => {
      this.log.debug('API     | Disconnected from Airtouch: %s', this.ip);
    });

    // Set up periodic connection health check (every 10 seconds)
    setInterval(this.checkLastDateReceived.bind(this), 10000);

    // Handle incoming data from controller
    this.device.on('data', (data: Buffer) => {
      this.lastDataTime = Date.now(); // Update activity timestamp

      // Extract message payload (skip first 10 bytes of TCP wrapper)
      const real_data = data.subarray(10);
      const header = real_data.subarray(0, 4);
      const address = real_data.subarray(5, 6);

      // Verify message header matches expected magic bytes
      const expected_header = Buffer.from([...MAGIC.HEADER_BYTES]);
      if(Buffer.compare(header, expected_header) !== 0) {
        this.log.debug('API     | Invalid header, discarding message.');
        return;
      }

      // Route message based on address type
      if(address[0] === MAGIC.ADDRESS_STANDARD_BYTES[0]) {
        this.decode_standard_message(real_data);
      } else if(address[0] === MAGIC.ADDRESS_EXTENDED_BYTES[0]) {
        this.decode_extended_message(real_data);
      } else {
        this.log.debug('API     | Got unknown message');
      }
    });

    // Handle connection errors to prevent crashing Homebridge
    this.device.on('error', (err: Error) => {
      this.log.error('API     | Connection Error: ' + err.message);
      this.device.destroy(); // Close broken connection

      // Attempt reconnection after 10 second delay
      setTimeout(() => {
        if (!this.device.readyState || this.device.destroyed) { // Only reconnect if not connected
          this.log.debug('API     | Attempting reconnect');
          this.emitter.emit('attempt_reconnect', this.AirtouchId);
        }
      }, 10000);
    });
  }
}