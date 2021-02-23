import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AcessoryFactory, ModbusAccessory } from './accessory';
import { ModbusPlatformConfig } from './config';
import { Modbus } from './modbus';


export class ModbusCustomPlugin implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly modbus: Modbus;

  private readonly accessories: Map<string, PlatformAccessory> = new Map<string, PlatformAccessory>();
  private readonly cache: PlatformAccessory[] = [];
  private readonly handlers: ModbusAccessory[] = [];
  
  private readonly scriptMap: Map<string, AcessoryFactory> = new Map<string, AcessoryFactory>();

  constructor(
    public readonly log: Logger,
    public readonly config: ModbusPlatformConfig,
    public readonly api: API,
  ) {    
    this.log.debug('Initializing platform: ', this.config.name);

    this.modbus = new Modbus({ 'port': this.config.port || 502, 'host':this.config.host }, 
      this.log, 
      this.config.unit || 1,
      this.config.poll || 1000);

    this.api.on('didFinishLaunching', () => {
      this.modbus.connect();
      this.loadScripts();
    });
  }
  
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.cache.push(accessory);
  }

  loadScripts() {
    if (!this.config.scripts) {
      this.log.warn('No scripts defined in config.json');
      return;
    }

    (async (list : Record<string, string>) => {
      for(const key in list) {
        const module = await import(list[key]);
        this.scriptMap.set(key, module.factory);
        
        if (!module.factory) {
          this.log.warn('Script "' + key + '" has no factory method. Skipped.');
          continue;
        }

        this.log.info('Script "' + key + '" loaded');
      }

      this.discoverDevices();
    })(this.config.scripts);
  }

  discoverDevices() {
    if (!this.config.accessories) {
      this.log.warn('No accessories defined in config.json');
      return;
    }
    
    const newAccessories:PlatformAccessory[] = [];

    // Discover devices
    this.log.debug('Loading accessories from config.json');
    this.config.accessories.forEach(element => {
      if (!this.scriptMap.has(element.script)) {
        this.log.warn('Unknown script "' + element.script + '" specified for device "' + element.name + '". Skipped.');
        return;
      }

      const uuid = this.api.hap.uuid.generate(element.id ? element.id : element.name);
      
      // Restore from cache or register new one
      let platformAccessory: PlatformAccessory | undefined = this.cache.find(accessory => accessory.UUID === uuid);
      if (platformAccessory) {
        this.log.debug('Restoring existing accessory from cache:', element.name);
      } 

      if (!platformAccessory) {
        this.log.debug('Creating new accessory:', element.name);
        platformAccessory = new this.api.platformAccessory(element.name, uuid);
        newAccessories.push(platformAccessory);
      }
      this.accessories.set(uuid, platformAccessory);

      // create handler
      const factory = this.scriptMap.get(element.script);
      if (!factory) {
        return;
      }
      const accessory: ModbusAccessory = factory({
        platform : this,
        accessory : platformAccessory,
        config: element,
      });

      this.handlers.push(accessory);
      
      this.log.debug('Accessory "' + element.name + '" loaded');
    });

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories);
    // initialize handlers
    this.handlers.forEach(handler => handler.init());

    let count = 0;
    this.log.debug('Checking for unused accessories.');
    this.cache.forEach(element => {
      // unregister devices from left in cache
      if (!this.accessories.has(element.UUID)) {
        this.log.debug('Removing unused accessory:' + element.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [element]);
        count++;
      }
    });
    if (count > 0) {
      this.log.info('Removed ' + count + ' unused devices');
    }
  }
}
