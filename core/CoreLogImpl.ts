import {Log4js} from "log4js";
import {CoreLog} from "./index";

export class CoreLogImpl implements CoreLog {
  private log4js: Log4js;

  constructor(log4jSettingJsonPath: string) {
    this.log4js = require('log4js');
    this.log4js.configure(log4jSettingJsonPath);
  }

  public accessLog(socket: any, eventName: string, category?: string, arg?: any): void {
    const logger = this.log4js.getLogger("access");
    let argStr: string;
    if (arg === undefined) argStr = "";
    else if (arg === null) argStr = "null";
    else if (Array.isArray(arg) || typeof arg === "object") {
      argStr = JSON.stringify(arg);
      // パスワードはマスクする
      argStr = argStr.replace(/([pP]assword[^:]*":)"[^"]*"/g, (_m: string, p1: string) => `${p1}"***"`);
    } else argStr = arg.toString();
    const categoryStr = category ? ` [${category}]` : "";
    logger.info(`[socketId:${socket.id}]${categoryStr} ${eventName} ${argStr}`);
  }

  public accessLogForWebApi(path: string, method: string, authorization: string | undefined): void {
    const logger = this.log4js.getLogger("access");
    logger.info(`[${method}] ${path} Authorization: ${authorization}`);
  }

  public errorLog(socket: any, eventName: string, message: string): void {
    const logger = this.log4js.getLogger("error");
    logger.error(`[socketId:${socket.id}] ${eventName} ${message}`);
  }

  public errorLogForWebApi(path: string, method: string, status: number, message: string): void {
    const logger = this.log4js.getLogger("error");
    logger.error(`[${method}] ${path} status: ${status} msg: ${message}`);
  }
}
