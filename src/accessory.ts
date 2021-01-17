import { Service, PlatformAccessory, Characteristic, Logger, API, WithUUID } from 'homebridge';
import { ModbusAccessoryConfig } from './config';
import { Modbus } from './modbus';

export type AcessoryFactory = (context : ModbusAccessoryContext) => ModbusAccessory;

export interface ModbusCustomPlatform {
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;

  readonly log: Logger;
  readonly api: API;
  readonly modbus: Modbus;
}

export interface ModbusAccessoryContext {
  platform: ModbusCustomPlatform;
  accessory: PlatformAccessory;
  config: ModbusAccessoryConfig;
}

export class ModbusAccessory {
  constructor(context : ModbusAccessoryContext) {
    this.platform = context.platform;
    this.accessory = context.accessory;
    this.log = this.platform.log;
    this.config = context.config;
    this.modbus = this.platform.modbus;
  }

  public readonly log:Logger;
  public readonly config: ModbusAccessoryConfig;
  public readonly platform: ModbusCustomPlatform;
  public readonly accessory: PlatformAccessory;
  public readonly modbus: Modbus;

  public init():void {
    return;
  }

  public address(address: string, location: string): string {
    const type = address[0];
    const index = parseInt(address.substr(1));
    if (isNaN(index) || !['c', 'd', 'h', 'i'].includes(type)) {
      this.log.warn('Invalid address (' + address + ') specified for ' + location);
      return '';
    }

    return address;
  }

  public setAcessoryInformation(manufacturer: string, model: string, serialNumber: string) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber);
  }

  public update() {
    this.platform.api.updatePlatformAccessories([this.accessory]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public service<T extends WithUUID<typeof Service>>(type: T, ... constructorArgs: any[]):Service {
    return this.accessory.getService(type) || (this.accessory.addService(type, ...constructorArgs));
  }

}
