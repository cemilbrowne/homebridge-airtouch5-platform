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
    registered: boolean;
    ac_accessory?: AirTouchACAccessory;
  }

export interface Zone {
    zone_number: number;
    ac_number: number;
    zone_name: string;
    zone_status?: ZoneStatus;
    registered: boolean;
    zone_accessory?: AirTouchZoneAccessory;
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
  zones: Array<Zone>;

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
    this.zones = new Array<Zone>();
  }

  AddAcAbility(ac_ability: AcAbility) {
    const ac_number = +ac_ability.ac_unit_number;
    const result = this.acs[ac_number];
    if(result === undefined) {
      this.createAc(ac_number, ac_ability);
      this.initialiseZonesForAc(ac_number, ac_ability);
    } else {
      this.log.debug('Received duplicate AC Capability - this plugin doesn\'t support changing AC abilities', ac_number);
    }
  }

  initialiseZonesForAc(ac_number: number, ac_ability: AcAbility) {
    const start_zone: number = +ac_ability.ac_start_zone;
    const count_zones: number = +ac_ability.ac_zone_count;
    for (let i:number = start_zone; i<(start_zone+count_zones); i++) {
      // Start initialising the zone array with ac mapping.
      if(this.zones[i] === undefined) {
        this.createZone(i, ac_number);
      }
      this.zones[i].ac_number = ac_number;
    }
  }

  AddUpdateZoneStatus(zone_status: ZoneStatus) {
    const zone_number = +zone_status.zone_number;
    if(this.zones[zone_number] === undefined) {
      this.log.debug('Got an updated zone status, but zone hasn\'t been initialised yet number: '+zone_number);
      return;
    }
    this.zones[zone_number].zone_status = zone_status;
    const ac_number = this.zones[zone_number].ac_number;
    if(this.zones[zone_number].registered === false) {
      this.registerZone(zone_number, ac_number);
    }
    this.zones[zone_number].zone_accessory!.updateStatus(this.zones[zone_number], this.acs[ac_number]);
  }

  AddZoneName(in_zone_number, zone_name) {
    const zone_number = +in_zone_number;
    if(this.zones[zone_number].zone_name === undefined) {
      this.log.debug('Got an updated zone name, but zone hasn\'t been initialised yet number: '+zone_number);
      return;
    } else {
      this.zones[zone_number].zone_name = zone_name;
    }
  }

  AddUpdateAcStatus(ac_status: AcStatus) {
    const ac_number = +ac_status.ac_unit_number;
    const result = this.acs[ac_number];
    if(result === undefined) {
      this.log.debug('Error condition adding AC Status - no existing AC with abilities with num: ', ac_number);
      return;
    } else {
      result.ac_status = ac_status;
      if(result.registered === false) {
        this.registerAc(ac_number);
      }
      this.acs[ac_number].ac_accessory!.updateStatus(this.acs[ac_number], this.zones);
    }
  }

  createAc(ac_number: number, ac_ability: AcAbility) {
    this.acs[ac_number] = {
      ac_number: ac_number,
      ac_ability: ac_ability,
      registered: false,
    };
  }

  registerAc(ac_number: number) {
    if(this.acs[ac_number].ac_status === undefined) {
      this.log.error('Attempting to register an AC without a status.');
      return;
    }
    const uuid = this.platform.api.hap.uuid.generate('AC'+this.AirtouchId+ac_number);
    const platform_accessory = new this.platform.api.platformAccessory('AC '+ac_number, uuid);
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
    this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platform_accessory]);
    this.acs[ac_number].ac_accessory = ac_accessory;
    this.acs[ac_number].registered = true;
  }

  createZone(zone_number: number, ac_number: number) {
    this.zones[zone_number] = {
      zone_number: zone_number,
      ac_number: ac_number,
      zone_name: 'Zone '+zone_number,
      registered: false,
    };
  }

  registerZone(zone_number: number, ac_number: number) {
    if(this.zones[zone_number].zone_status === undefined) {
      this.log.error('Attempting to register a Zone without a status.');
      return;
    }
    const uuid = this.platform.api.hap.uuid.generate('Zone'+this.AirtouchId+ac_number+zone_number);
    const platform_accessory = new this.platform.api.platformAccessory('Zone '+zone_number, uuid);
    const zone_accessory:AirTouchZoneAccessory = new AirTouchZoneAccessory(this.platform,
      platform_accessory,
      this.AirtouchId,
      zone_number,
      this.zones[zone_number],
      this.acs[ac_number],
      this.log,
      this.api,
    );
    this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platform_accessory]);
    this.zones[zone_number].zone_accessory = zone_accessory;
    this.zones[zone_number].registered = true;
  }

}