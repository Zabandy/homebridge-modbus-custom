import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, Characteristic } from 'homebridge';

export const factory:AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new ThermostatModbus(context);
};

interface ThermostatConfig extends ModbusAccessoryConfig {
    min: 10;
    max: 36;
    temp: string;
    target: string;
}

export class ThermostatModbus extends ModbusAccessory {
    private device: Service | undefined;

    private registers = {
      temp: '',
      target: '',
    };

    private states = {
      TargetTemperature: 23,
      CurrentTemperature: 0,
      TargetHeatingCoolingState: 0,
      CurrentHeatingCoolingState: 0,
    };

    public init():void {
      this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
        'Custom-Modbus-Radiator', 
        'Modbus-Accessory-Serial');

      const validValues = [0, 3];

      const config: ThermostatConfig = this.config as ThermostatConfig;
      this.registers.temp = this.address(config.temp, '"temp" property in "' + this.config.name + '" accessory');
      this.registers.target = this.address(config.target, '"target" property in "' + this.config.name + '" accessory');
      
      this.device = this.service(this.platform.Service.Thermostat);
      this.device.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

      //#region Current Heating Cooling State
      this.states.CurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      let characteristic: Characteristic;
      
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);
      characteristic.on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.CurrentHeatingCoolingState);
      });
      characteristic.props.validValues = validValues;
      characteristic.updateValue(this.states.CurrentHeatingCoolingState);
      //#endregion

      //#region Target Heating Cooling State
      this.states.TargetHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);
      characteristic.on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.TargetHeatingCoolingState); 
      });
      characteristic.on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        callback(null);
      });
      characteristic.props.validValues = validValues;
      characteristic.updateValue(this.states.TargetHeatingCoolingState);
      //#endregion

      //#region Current Temperature
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.CurrentTemperature);
        })
        .updateValue(this.states.CurrentTemperature);
      
      // track current temperature
      this.modbus.on(this.registers.temp, (address, value) => {
        this.states.CurrentTemperature = value as number;
        this.device?.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .updateValue(this.states.CurrentTemperature);
      });
      characteristic.props.minValue = config.min;
      characteristic.props.maxValue = config.max;
      characteristic.props.minStep = 1;
      //#endregion

      //#region Target Temperature
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.TargetTemperature);
        })
        .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.states.TargetTemperature = value as number;
          this.modbus.set(this.registers.target, this.states.TargetTemperature);
          callback(null);
        })
        .updateValue(this.states.TargetTemperature);

      // track target temperature
      this.modbus.on(this.registers.target, (address, value) => {
        this.states.CurrentTemperature = value as number;
        this.device?.getCharacteristic(this.platform.Characteristic.TargetTemperature)
          .updateValue(this.states.TargetTemperature);
      });

      characteristic.props.minValue = config.min;
      characteristic.props.maxValue = config.max;
      characteristic.props.minStep = 1;
      //#endregion
        
      this.device.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
        .updateValue(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);

      this.log.debug('Thermostat modbus "' + this.config.name + '" accessory initialized.');
    }
}