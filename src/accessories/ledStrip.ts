import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, Categories } from 'homebridge';
import { ModbusAccessoryConfig } from '../config';

export const factory: AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new LedStripModbusLight(context);
};

interface LedStripConfig extends ModbusAccessoryConfig {
  on: string;
  brightness: string;
  transition: string;
}

export class LedStripModbusLight extends ModbusAccessory {
  private device: Service | undefined;

  private registers = {
    on: '',
    brightness: '',
    transition: '',
  };

  private states = {
    on: false,
    brightness: 50,
    transition: 1,
  };

  private modes: Service[] = [];
  private modeServices: Record<number, Service> = {};

  public init():void {
    this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
      'Custom-Modbus-Device', 
      'Modbus-Accessory-Serial');

    this.accessory.category = Categories.LIGHTBULB;

    const config = this.config as LedStripConfig;
    this.registers.on = this.address(config.on, 'on');
    this.registers.transition = this.address(config.transition, 'transition');
    this.registers.brightness = this.address(config.on, 'brightness');

    this.device = this.service(this.platform.Service.Television);
    const dev = this.device;

    dev.setCharacteristic(this.platform.Characteristic.Name, this.config.name);
    dev.setCharacteristic(this.platform.Characteristic.ConfiguredName, config.name);
    dev.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, 
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    dev.setCharacteristic(this.platform.Characteristic.Category, Categories.LIGHTBULB);
    
    // dev.setPrimaryService(true);
    //#region Active characteristic
    dev.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.on = value as boolean;

        // set device state over modbus
        this.modbus.set(this.registers.on, this.states.on ? 101 : 0);
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.on);
      })
      .updateValue(this.states.on);
      
    this.modbus.on(this.registers.on, (address, value) => {
      this.states.transition = value as number;
      this.states.on = this.states.transition > 0;
      this.device?.updateCharacteristic(this.platform.Characteristic.Active, this.states.on);
      this.device?.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.states.transition);
    });
    //#endregion

    //#region Brightness characteristic
    /*
    this.lightbulb.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.brightness = value as number;
        if (this.states.on) {
          this.modbus.set(this.device.brightness, this.states.brightness);
        }
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.brightness);
      })
      .updateValue(this.states.brightness);
    //*/
    /*
    this.modbus.on(this.device.brightness, (address, value) => {
      this.states.brightness = value as number;
      this.lightbulb?.getCharacteristic(this.platform.Characteristic.Brightness)
        .updateValue(this.states.brightness);
    });
    
    //*/
    //#endregion
    
    //#region Transition Mode service
    //*
    
    dev.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug('led transition  ' + value);
        this.states.transition = value as number;

        this.log.debug('led transition programm is set to ' + this.states.transition);
        // set device state over modbus
        this.modbus.set(this.registers.transition, this.states.on ? this.states.transition : 0);
        callback(null);
      });
    dev.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, 1);

    const modes = [ 
      {id: 1, name: 'Белый свет'},
      {id: 92, name: 'Синий свет'},
      {id: 14, name: 'Случайное безумие'},
      {id: 25, name: 'Вспышки'},
      {id: 27, name: 'Пропеллер'},
      {id: 30, name: 'Радуга'},
      {id: 40, name: 'Вспышки белого'}, 
    ];

    for (let i = 0; i < modes.length; i++) {
      const inser = this.accessory.getService(modes[i].name) ||
      this.accessory.addService(this.platform.Service.InputSource, modes[i].name, 'transitionMode'+i);

      inser.setCharacteristic(this.platform.Characteristic.Identifier, modes[i].id)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, modes[i].name)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN)
        .setCharacteristic(this.platform.Characteristic.TargetVisibilityState, this.platform.Characteristic.TargetVisibilityState.SHOWN);  
      dev.addLinkedService(inser);
    }
    //#endregion

    this.accessory.category = Categories.LIGHTBULB;
  }
}