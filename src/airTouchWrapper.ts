import { Logger } from 'homebridge';
import { AirtouchAPI, AcAbility, AcStatus, ZoneStatus } from './api';
import { AirTouchZoneAccessory } from './platformZoneAccessory';
import { AirTouchACAccessory } from './platformACAccessory';
import { EventEmitter } from 'events';
import { AirtouchPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export interface AC {
    ac_number: number;
    ac_ability: AcAbility;
    ac_status?: AcStatus;
    ac_accessory?: AirTouchACAccessory;
  }

export class Airtouch5Wrapper {
  //
  // Helper class for wrapping an Airtouch5.  Maintains the mapping of controller -> ac -> zones.
  //

  ip: string;
  consoleId: string;
  AirtouchId: string;
  deviceName: string;
  platform: AirtouchPlatform;
  api: AirtouchAPI;
  acs: Array<AC>;
  log: Logger;
  emitter: EventEmitter;
  zones: Array<ZoneStatus>;

  zoneMapping: Array<number>;
  zoneAccessories: Array<AirTouchZoneAccessory>;

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
    this.api = new AirtouchAPI(ip, consoleId, AirtouchId, deviceName, log, emitter);
    this.api.connect();
    this.acs = new Array<AC>();
    this.zones = new Array<ZoneStatus>(16);
    this.zoneMapping = Array(16).fill(-1);
    this.zoneAccessories = new Array<AirTouchZoneAccessory>(16);
  }

  AddAcAbility(ac_ability: AcAbility) {
    const new_ac_number = +ac_ability.ac_unit_number;
    const result = this.acs.find(({ ac_number }) => ac_number === new_ac_number);
    if(result === undefined) {
      this.acs[new_ac_number] = {
        ac_number: new_ac_number,
        ac_ability: ac_ability,
      };
      const zonestart: number = +ac_ability.ac_start_zone;
      const count_zones:number = +ac_ability.ac_zone_count;
      for (let i:number = zonestart; i<(zonestart+count_zones); i++) {
        this.zoneMapping[i] = new_ac_number;
      }
    } else {
      this.log.debug('Received AC Capability, but AC Number was already there, so ignoring it: ', new_ac_number);
    }
  }

  AddUpdateZoneStatus(zone_status: ZoneStatus) {
    const zone_number = parseInt(zone_status.zone_number);
    this.zones[zone_number] = zone_status;
  }

  AddZoneName(in_zone_number, zone_name) {
    const zone_number = +in_zone_number;
    if(this.zones[zone_number].zone_name === undefined) {
      this.zones[zone_number].zone_name = zone_name;
      const uuid = this.platform.api.hap.uuid.generate(''+this.AirtouchId+zone_number);
      if(this.zoneAccessories[in_zone_number]) {
        this.log.debug('Tried to add existing UUID, backing out');
        return;
      }
      // create a new accessory
      const accessory = new this.platform.api.platformAccessory(''+ zone_name!, uuid);

      accessory.context.ZoneNumber = zone_number;
      accessory.context.AirtouchId = this.AirtouchId;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      this.zoneAccessories[zone_number] = new AirTouchZoneAccessory(this.platform, accessory, this.AirtouchId, zone_number);

      // link the accessory to your platform
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

    } else {
      this.zones[zone_number].zone_name = zone_name;
    }
  }

  AddUpdateAcStatus(ac_status: AcStatus) {
    const new_ac_number = +ac_status.ac_unit_number;
    const result = this.acs.find(({ ac_number }) => ac_number === new_ac_number);
    if(result === undefined) {
      this.log.debug('Error condition adding AC Status - no existing AC with abilities with num: ', new_ac_number);
    } else {
      result.ac_status = ac_status;
      if(result.ac_accessory === undefined) {
        this.createAcAccessory(result);
      }
    }
  }

  createAcAccessory(ac:AC) {
    const uuid = this.platform.api.hap.uuid.generate('AC'+this.AirtouchId+ac.ac_number);
    // create a new accessory
    const accessory = new this.platform.api.platformAccessory(''+ ac.ac_ability.ac_name!, uuid);

    accessory.context.AcNumber = ac.ac_number;
    accessory.context.AirtouchId = this.AirtouchId;

    // create the accessory handler for the newly create accessory
    // this is imported from `platformAccessory.ts`
    ac.ac_accessory = new AirTouchACAccessory(this.platform, accessory, this.AirtouchId, ac.ac_number);

    // link the accessory to your platform
    this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }
}