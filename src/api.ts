import { MAGIC } from './magic';
import { Logger } from 'homebridge';
import * as net from 'net';
import * as dgram from 'dgram';
import { EventEmitter } from 'events';

export interface AcAbility {
  ac_unit_number: string;
  ac_name: string;
  ac_start_zone: string;
  ac_zone_count: string;
  ac_support_cool_mode: string;
  ac_support_fan_mode: string;
  ac_support_dry_mode: string;
  ac_support_heat_mode: string;
  ac_support_auto_mode: string;
  ac_support_fan_intelligent: string;
  ac_support_fan_turbo: string;
  ac_support_fan_powerful: string;
  ac_support_fan_high: string;
  ac_support_fan_medium: string;
  ac_support_fan_low: string;
  ac_support_fan_quiet: string;
  ac_support_fan_auto: string;
  ac_min_cool: string;
  ac_max_cool: string;
  ac_min_heat: string;
  ac_max_heat: string;
}

export interface AcStatus {
  ac_unit_number: string;
  ac_power_state: string;
  ac_mode: string;
  ac_fan_speed: string;
  ac_target: string;
  ac_temp: string;
  ac_spill: string;
  ac_timer: string;
  ac_error_code: string;
}

export interface ZoneStatus {
  zone_number: string;
  zone_name?: string;
  zone_power_state: string;
  zone_control_type: string;
  zone_damper_position: string;
  zone_target: string;
  zone_temp: string;
  zone_battery_low: string;
  zone_has_sensor: string;
  zone_has_spill: string;
}

export class AirtouchAPI {
  log;
  device;
  emitter;
  lastDataTime;
  got_ac_ability: boolean;
  got_zone_status: boolean;
  public readonly ip: string;
  public readonly consoleId: string;
  public readonly AirtouchId: string;
  public readonly deviceName: string;
  //
  // Airtouch API
  // TCP socket client for the Airtouch Touchpad Controller
  // Listens and decodes broadcast messages containing AC and Group states
  // Encodes and sends messages containing AC and Group commands
  //
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

  static async discoverDevices(log, myemitter: EventEmitter) {
    const message = Buffer.from('::REQUEST-POLYAIRE-AIRTOUCH-DEVICE-INFO:;');
    const socket = dgram.createSocket('udp4');
    socket.on('message', (message) => {
      if(message.toString() !== '::REQUEST-POLYAIRE-AIRTOUCH-DEVICE-INFO:;') {
        const messages = message.toString().split(',');
        const ip = messages[0];
        const consoleId = messages[1];
        const AirtouchId = messages[3];
        const deviceName = messages[4];

        log.debug('APIDISC | Found device on ip: '+ip+' with consoleId: '+consoleId);
        myemitter.emit('found_devices', ip, consoleId, AirtouchId, deviceName);
      }
    });

    socket.bind(49005);
    socket.on('listening', () => {
      socket.setBroadcast(true);
      setTimeout(() => {
        log.debug('APIDISC | Hit timeout looking for devices, closing socket.');
        try {
          socket.close();
        } catch (err) {
          log.debug('Unable to close socket.');
        }
      }, 5000);
      log.debug('APIDISC | Sending broadcast to search for devices.');
      socket.send(message, 0, message.length, 49005, '255.255.255.255');
    });
  }

  // messages have the data checksummed using modbus crc16
  // crc16 implementation from https://github.com/yuanxu2017/modbus-crc16
  crc16(buffer) {
    let crc = 0xFFFF;
    let odd;

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

  // check if value is undefined, and replace it with a default value
  isNull(val, nullVal) {
    return val === undefined ? nullVal : val;
  }

  assemble_extended_message(data) {
    this.log.debug('API     | Assembling extended message to get information');
    const startbuf = Buffer.from([...MAGIC.ADDRESS_EXTENDED_BYTES, 0x01, MAGIC.MSGTYPE_EXTENDED]);

    const databuf = Buffer.from([...data]); // The data buffer, padded out

    // get data length
    const datalen = Buffer.alloc(2);

    datalen.writeUInt16BE(databuf.length);

    const finalbuf = Buffer.concat([startbuf, datalen, databuf]); // Bring it all together - now ready to assemble into a message.
    return finalbuf;
  }

  assemble_standard_message(type, data) {
    this.log.debug('API     | Assembling standard message with type ' + type.toString(16));

    // The start of the buffer contains some generic info.

    const startbuf = Buffer.from([...MAGIC.ADDRESS_STANDARD_BYTES, 0x01, MAGIC.MSGTYPE_STANDARD]);

    const databuf = Buffer.from([...[type], 0x00, 0x00, 0x00, ...data]); // The data buffer, padded out

    // get data length
    const datalen = Buffer.alloc(2);

    datalen.writeUInt16BE(databuf.length);

    const finalbuf = Buffer.concat([startbuf, datalen, databuf]); // Bring it all together - now ready to assemble into a message.
    return finalbuf;
  }

  decode_extended_message(data) {
    // this.log("Decoding Extended Message");
    // this.log(data);
    const message_type = data.slice(11, 12); // Location of the message type in the return - see spec
    if(message_type[0] === MAGIC.EXT_SUBTYPE_AC_ABILITY) {
      this.log.debug('API     | Got Extended message - AC ABILITY');
      this.decode_ac_ability(data.slice(12, data.length-2));
    } else if (message_type[0] === MAGIC.EXT_SUBTYPE_AC_ERROR) {
      this.log.debug('API     | Got Extended message - AC ERROR');
    } else if (message_type[0] === MAGIC.EXT_SUBTYPE_ZONE_NAME) {
      this.log.debug('API     | Got Extended message - ZONE NAMES');
      this.decode_zone_names(data.slice(12, data.length-2));
    } else {
      // this.log.debug('API     | Got unknown extended message.  This isn\'t necessarily an error condition. ');
      // this.log.debug(data);
    }
  }

  decode_standard_message(data) {
    // this.log("Decoding Standard Message");
    // this.log.debug(data);
    const message_type = data.slice(10, 11); // Location of the message type in the return - see spec

    const repeat_data_length = data.slice(14, 16).readUInt16BE();
    const count_repeats = data.slice(16, 18).readUInt16BE();
    if(message_type[0] === MAGIC.SUBTYPE_ZONE_STAT) {
      this.decode_zones_status(count_repeats, repeat_data_length, data.slice(18, data.length-2));
    } else if (message_type[0] === MAGIC.SUBTYPE_AC_STAT) {
      this.decode_ac_status(count_repeats, repeat_data_length, data.slice(18, data.length-2));
    } else {
      // this.log.debug('API     | Got unknown standard message.  This isn\'t necessarily an error condition. ');
      // this.log.debug(data);
    }
  }

  // send message to the Airtouch Touchpad Controller
  send(data) {

    // this.log("API     | Preparing and sending message containing:");
    // this.log(data);


    const crc = Buffer.alloc(2);
    crc.writeUInt16BE(this.crc16(data));
    // assemble message
    const message = Buffer.from([...MAGIC.HEADER_BYTES, ...data, ...crc]);
    // this.log.debug('API     | Message to send:');
    // this.log.debug(message);
    // this.log(message);
    // // send message
    this.device.write(message);
  }

  // encode a message for AC command
  encode_ac_control(unit) {
    let byte1 = this.isNull(unit.ac_unit_number, MAGIC.AC_UNIT_DEFAULT);
    byte1 = byte1 | ((this.isNull(unit.ac_power_state, MAGIC.AC_POWER_STATES.KEEP)) << 4);
    let byte2 = this.isNull(unit.ac_fan_speed, MAGIC.AC_FAN_SPEEDS.KEEP);
    byte2 = byte2 | ((this.isNull(unit.ac_mode, MAGIC.AC_MODES.KEEP)) << 4);
    const byte3 = (this.isNull(unit.ac_target_keep, MAGIC.AC_TARGET_TYPES.KEEP) << 4);
    const byte4 = this.isNull(unit.ac_target_value, MAGIC.AC_TARGET_DEFAULT);
    this.log.debug('API     | Encoded AC Control message, unit:'+JSON.stringify(unit));
    return Buffer.from([byte1, byte2, byte3, byte4]);
  }

  // send command to change AC mode (OFF/HEATING/COOLING/AUTO)
  acSetActive(unit_number, active) {
    const target = {
      unit_number: unit_number,
      ac_power_state: active ? MAGIC.AC_POWER_STATES.ON : MAGIC.AC_POWER_STATES.OFF,
    };
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  // send command to change AC mode (OFF/HEATING/COOLING/AUTO)
  acSetTargetTemperature(unit_number, value: number) {
    const target = {
      ac_unit_number: unit_number,
      ac_target_keep: MAGIC.AC_TARGET_TYPES.SET_VALUE,
      ac_target_value: (value*10)-100,
    };
    this.log.debug('API     | Setting AC temperature to: ' + JSON.stringify(target));
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }

  // send command to change AC mode (OFF/HEATING/COOLING/AUTO)
  acSetTargetHeatingCoolingState(unit_number, state) {
    let target;
    this.log.debug('API     | in acSetTargetHeatingCooling, target: '+state);
    switch (state) {
      case MAGIC.AC_TARGET_STATES.OFF: // OFF
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.OFF,
        };
        break;
      case MAGIC.AC_TARGET_STATES.HEAT: // HEAT
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.HEAT,
        };
        break;
      case MAGIC.AC_TARGET_STATES.COOL: // COOL
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.COOL,
        };
        break;
      case MAGIC.AC_TARGET_STATES.AUTO: // everything else is AUTO
        target = {
          ac_unit_number: unit_number,
          ac_power_state: MAGIC.AC_POWER_STATES.ON,
          ac_mode: MAGIC.AC_MODES.AUTO,
        };
    }
    this.log.debug('API     | Setting AC heating/cooling state to: ' + JSON.stringify(target));
    const data: Buffer = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }


  // send command to change AC fan speed
  acSetFanSpeed(unit_number, speed) {
    const target = {
      ac_unit_number: unit_number,
      ac_fan_speed: speed,
    };
    this.log.debug('API     | Setting AC fan speed ' + JSON.stringify(target));
    const data = this.encode_ac_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_CTRL, to_send);
    this.send(message);
  }


  decode_zone_names(data: Buffer) {
    const length = data.length;
    if(length > 0) {
      let counter = 0;
      while (counter < length) {
        const zone_number = data[counter];
        const zone_name_length = data[counter+1];
        const zone_name = data.slice(counter+2, counter+2+zone_name_length).toString();
        counter = counter + 2 + zone_name_length;
        this.emitter.emit('zone_name', zone_number, zone_name, this.AirtouchId);
      }
    }
  }

  decode_ac_ability(data) {
    const length = data.length;
    const count_repeats = length/MAGIC.LENGTH_AC_ABILITY;
    // this.log.debug('API     | Got an AC ability message - count:', count_repeats);
    for (let i = 0; i < count_repeats; i++) {
      const unit = data.slice(i*MAGIC.LENGTH_AC_ABILITY, i*MAGIC.LENGTH_AC_ABILITY+MAGIC.LENGTH_AC_ABILITY);
      const ac_unit_number = unit[0];
      const ac_name_temp = data.slice(2, 18).toString();
      let ac_name = '';
      const c = ac_name_temp.indexOf('\0');
      if (c>-1) {
        ac_name = ac_name_temp.substr(0, c);
      } else {
        ac_name = ac_name_temp;
      }
      const ac_start_zone = unit[18];
      const ac_zone_count = unit[19];
      const ac_support_cool_mode = (unit[20] & 0b00010000) >> 4;
      const ac_support_fan_mode = (unit[20] & 0b00001000) >> 3;
      const ac_support_dry_mode = (unit[20] & 0b00000100) >> 2;
      const ac_support_heat_mode = (unit[20] & 0b00000010) >> 1;
      const ac_support_auto_mode = (unit[20] & 0b00000001);
      const ac_support_fan_intelligent = (unit[21] & 0b10000000) >> 7;
      const ac_support_fan_turbo = (unit[21] & 0b01000000) >> 6;
      const ac_support_fan_powerful = (unit[21] & 0b00100000) >> 5;
      const ac_support_fan_high = (unit[21] & 0b00010000) >> 4;
      const ac_support_fan_medium = (unit[21] & 0b00001000) >> 3;
      const ac_support_fan_low = (unit[21] & 0b00000100) >> 2;
      const ac_support_fan_quiet = (unit[21] & 0b00000010) >> 1;
      const ac_support_fan_auto = (unit[21] & 0b00000001);
      const ac_min_cool = unit[22];
      const ac_max_cool = unit[23];
      const ac_min_heat = unit[24];
      const ac_max_heat = unit[25];
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
      this.emitter.emit('ac_ability', to_push, this.AirtouchId);
    }
    this.got_ac_ability = true;
    this.GET_AC_STATUS();
    this.GET_ZONE_STATUS();
  }


  // decode AC status information and send it to homebridge
  decode_ac_status(count_repeats, data_length, data) {
    // this.log("Count to decode : " + count_repeats + " length : " + data_length);
    for (let i = 0; i < count_repeats; i++) {
      const unit = data.slice(i*8, i*8+8);
      const ac_power_state = (unit[0] & 0b11110000) >> 4;
      const ac_unit_number = unit[0] & 0b00001111;
      const ac_mode = (unit[1] & 0b11110000) >> 4;
      const ac_fan_speed = unit[1] & 0b00001111;
      const ac_spill = (unit[3] & 0b00000010) >> 1;
      const ac_timer = (unit[3] & 0b00000001);
      const ac_target = ((parseInt(unit[2]))+100.0) / 10.0;
      const ac_temp = (((unit[4] << 8) + ((unit[5]))) - 500) / 10;
      const ac_error_code = (unit[6] << 8) + (unit[7]);
      const to_push = {
        ac_unit_number: ac_unit_number,
        ac_power_state: ac_power_state,
        ac_mode: ac_mode,
        ac_fan_speed: ac_fan_speed,
        ac_target: ac_target,
        ac_temp: ac_temp,
        ac_spill: ac_spill,
        ac_timer: ac_timer,
        ac_error_code: ac_error_code,
      };
      this.emitter.emit('ac_status', to_push, this.AirtouchId);
    }
  }

  // decode groups status information and send it to homebridge
  decode_zones_status(count_repeats, data_length, data) {
    // this.log("Count to decode : " + count_repeats + " length : " + data_length);
    for (let i = 0; i < count_repeats; i++) {
      const group = data.slice(i*8, i*8+8);
      // this.log(group)
      const zone_power_state = (group[0] & 0b11000000) >> 6;
      const zone_number = group[0] & 0b00111111;
      const zone_control_type = (group[1] & 0b10000000) >> 7;
      const zone_open_perc = group[1] & 0b01111111;
      const zone_target = ((group[2])+100.0)/10.0;
      const zone_has_sensor = (group[3] & 0b10000000) >> 7;
      const zone_temp = (((group[4] << 8) + ((group[5]))) - 500) / 10;
      const zone_has_spill = (group[6] & 0b00000010) >> 1;
      const zone_battery_low = (group[6] & 0b00000001);
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
      // For testing only
      // to_push.zone_has_sensor = 0;
      this.emitter.emit('zone_status', to_push, this.AirtouchId);
    }
    if(this.got_zone_status === false) {
      this.got_zone_status = true;
      this.GET_ZONE_NAMES();
    }
  }

  // encode a message for AC command
  encode_zone_control(zone):Buffer {
    const byte1 = this.isNull(zone.zone_number, MAGIC.ZONE_NUMBER_DEFAULT);
    let byte2 = this.isNull(zone.zone_power_state, MAGIC.ZONE_POWER_STATES.KEEP);
    byte2 = byte2 | ((this.isNull(zone.zone_target_type, MAGIC.ZONE_TARGET_TYPES.KEEP)) << 5);
    const byte3 = zone.zone_target || 0;
    const byte4 = 0;
    this.log.debug('API     | Encoded Zone Control message, zone:'+JSON.stringify(zone));
    return Buffer.from([byte1, byte2, byte3, byte4]);
  }

  // send command to change zone power state (ON/OFF)
  zoneSetActive(zone_number, active) {
    const target = {
      zone_number: zone_number,
      zone_power_state: active ? MAGIC.ZONE_POWER_STATES.ON : MAGIC.ZONE_POWER_STATES.OFF,
    };
    this.log.debug('API     | Setting zone state: ' + JSON.stringify(target));
    const data: Buffer = this.encode_zone_control(target);
    this.log.debug('API     | zoneActive, sending: ', data);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  // send command to change zone percentage
  zoneSetPercentage(zone_number, value) {
    const target = {
      zone_number: zone_number,
      zone_power_state: MAGIC.ZONE_POWER_STATES.ON,
      zone_target_type: MAGIC.ZONE_TARGET_TYPES.DAMPER,
      zone_target: value,
    };
    this.log.debug('API     | Setting zone percentage: ' + JSON.stringify(target));
    const data: Buffer = this.encode_zone_control(target);
    this.log.debug('API     | zoneSetPercentage, sending: ', data);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  // send command to set target temperature
  zoneSetTargetTemperature(zone_number: number, temp: number) {
    const target = {
      zone_number: zone_number,
      zone_power_state: MAGIC.ZONE_POWER_STATES.ON,
      zone_target_type: MAGIC.ZONE_TARGET_TYPES.TEMPERATURE,
      zone_target: temp*10-100,
    };
    this.log.debug('API     | Setting target temperature: ' + JSON.stringify(target));
    const data: Buffer = this.encode_zone_control(target);
    const to_send = Buffer.from([0x00, 0x04, 0x00, 0x01, ...data]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_CTRL, to_send);
    this.send(message);
  }

  // send command to get AC status
  GET_AC_STATUS() {
    if(this.got_ac_ability === true) {
      const data = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const message = this.assemble_standard_message(MAGIC.SUBTYPE_AC_STAT, data);
      this.send(message);
    }
  }

  GET_AC_ABILITY() {
    const data = Buffer.from([0xff, 0x11, 0x00]);
    const message = this.assemble_extended_message(data);
    this.send(message);
  }

  // send command to get group status
  GET_ZONE_STATUS() {
    // due to a bug, cannot send empty data
    // so we send one byte of data
    const data = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const message = this.assemble_standard_message(MAGIC.SUBTYPE_ZONE_STAT, data);
    this.send(message);
  }

  GET_ZONE_NAMES() {
    if(this.got_zone_status === true) {
      const data = Buffer.from([0xff, 0x13]);
      const message = this.assemble_extended_message(data);
      this.send(message);
    }
  }

  checkLastDateReceived() {
    const currDate = Date.now();
    const diff = Math.floor((currDate - this.lastDataTime)/1000);
    if(diff > 120) {
      this.log.debug('API     | Went past the expected time to receive a message. This may not be an error message if the AC is off.');
      this.device.destroy();
      this.log.debug('API     | Attempting reconnect');
      this.emitter.emit('attempt_reconnect', this.AirtouchId);
    }
  }

  // connect to Airtouch Touchpad Controller socket on tcp port 9005
  connect() {
    this.log.debug('API     | Beginning connection to: ' + this.ip);
    this.device = new net.Socket();
    this.device.connect(9005, this.ip, () => {
      this.log.debug('API     | Connected to Airtouch');
      // request information from Airtouch after connection
      this.GET_AC_ABILITY();

    });
    this.lastDataTime = Date.now();
    this.device.on('close', () => {
      this.log.debug('API     | Disconnected from Airtouch');
    });
    setInterval(this.checkLastDateReceived.bind(this), 10000);
    // listener callback
    this.device.on('data', (data) => {
      this.lastDataTime = Date.now();
      const real_data = data.slice(10);
      const header = real_data.slice(0, 4);
      const address = real_data.slice(5, 6);

      const expected_header = Buffer.from([...MAGIC.HEADER_BYTES]);

      if(Buffer.compare(header, expected_header) !== 0) {
        this.log.debug('API     | Invalid header, discarding message.');
      }

      if(address[0] === MAGIC.ADDRESS_STANDARD_BYTES[0]) {
        this.decode_standard_message(real_data);
      } else if(address[0] === MAGIC.ADDRESS_EXTENDED_BYTES[0]) {
        this.decode_extended_message(real_data);
      } else {
        this.log.debug('API     | Got unknown message');
        // this.log(real_data);
      }
    });

    // error handling to stop connection errors bringing down homebridge
    this.device.on('error', (err) => {
      this.log.error('API     | Connection Error: ' + err.message);
      this.device.destroy(); //close the connection even though its already broken
      setTimeout(() => {
        if (!this.device.listening) { //only attempt reconnect if not already re-connected
          this.log.debug('API     | Attempting reconnect');
          this.emitter.emit('attempt_reconnect', this.AirtouchId);
        }
      }, 10000);
    });

  }
}