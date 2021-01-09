import { PlatformConfig } from 'homebridge';

export interface ModbusPlatformConfig extends PlatformConfig
{
    port?: number;
    host?: string;
    unit?: number;
    poll?: number;
    scripts?: Record<string, string>;
    accessories?:ModbusAccessoryConfig[];
}

export interface ModbusCustomTypeConfig extends Record<string, unknown>
{
    name: string;
    script: string;
}

export interface ModbusAccessoryConfig extends Record<string, unknown>
{
    name: string;
    script: string;
    id?: string;
}