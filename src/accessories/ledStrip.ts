import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, Characteristic } from 'homebridge';
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
  private lightbulb: Service | undefined;

  private device = {
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

  public init():void {
    this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
      'Custom-Modbus-Device', 
      'Modbus-Accessory-Serial');

    const config = this.config as LedStripConfig;
    this.device.on = this.address(config.on, 'on');
    this.device.brightness = this.address(config.on, 'brightness');
    
    this.lightbulb = this.service(this.platform.Service.Lightbulb);
    this.lightbulb.setCharacteristic(this.platform.Characteristic.Name, this.config.name);
    
    this.lightbulb.getCharacteristic(this.platform.Characteristic.On)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.on = value as boolean;

        // set device state over modbus
        this.modbus.set(this.device.on, this.states.on ? 101 : 0);
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.on);
      })
      .updateValue(this.states.on);

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

    this.modbus.on(this.device.on, (address, value) => {
      this.states.on = value as boolean;
      this.lightbulb?.getCharacteristic(this.platform.Characteristic.On)
        .updateValue(this.states.on);
    });

    this.modbus.on(this.device.brightness, (address, value) => {
      this.states.brightness = value as number;
      this.lightbulb?.getCharacteristic(this.platform.Characteristic.Brightness)
        .updateValue(this.states.brightness);
    });
      
    /*
    this.addMode('Белый свет', 1);
    this.addMode('Синий свет', 92);
    this.addMode('Безумие случайных цветов', 14);
    this.addMode('Случайные вспышки', 25);
    this.addMode('Цветовой пропеллер', 27);
    this.addMode('Вращающаяся радуга', 30);
    this.addMode('Вспышки белого', 40);
    this.addMode('Неизвестно 1', 77);
    this.addMode('Неизвестно 2', 44);
    this.addMode('Неизвестно 3', 88);
    //*/
  }

  private addMode(name: string, transitionValue: number):Service {
    const id = 'switch-mode-' + transitionValue;
    const service = this.accessory.getService(name) ||
      this.accessory.addService(this.platform.Service.Lightbulb, name, id);
    service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.transition = transitionValue;

        if (!transitionValue || !this.states.on) {
          callback(null);
          return;
        }
        
        this.modbus.set(this.device.transition, this.states.on ? transitionValue : 0);
        // TODO: set device state over modbus

        // turn off all other modes
        for (let i = 0; i < this.modes.length; i++) {
          if (this.modes[i].name !== name) {
            this.modes[i].getCharacteristic(this.platform.Characteristic.On).updateValue(false);
          }
        }
        
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.on ? this.states.transition === transitionValue : false);
      });

    this.modes.push(service);
    return service;
  }
}