import {CoreSocket} from "./index";
import {Core, UploadMediaInfo} from "../index";

export class CoreSocketImpl implements CoreSocket {
  public constructor(private core: Core) {}

  public setEvent<T, U>(
    socket: any,
    func: (core: Core, socket: any, arg: T) => Promise<U>,
    eventName: string,
    resultEventGetter: (arg: T) => string | null
  ): void {
    socket.on(eventName, async (arg: T) => {
      const resultEventRaw = resultEventGetter(arg)
      const resultEvent = resultEventRaw !== null ? resultEventRaw : `result-${eventName}`;
      console.log(`socket.on ${eventName}`);
      const logArg = arg ? JSON.parse(JSON.stringify(arg)) : null;
      if (eventName === "upload-media") {
        logArg.uploadMediaInfoList.forEach((info: UploadMediaInfo) => {
          info.imageSrc = "[Binary Array]";
          if (info.dataLocation === "server") {
            delete info.arrayBuffer;
          }
        });
      }
      this.core.log.accessLog(socket, eventName, "START", logArg);
      try {
        const result = await func(this.core, socket, arg);
        this.core.log.accessLog(socket, resultEvent, "END  ", result);
        if (resultEvent) socket.emit(resultEvent, null, result);
      } catch (err) {
        // アクセスログは必ず閉じる
        this.core.log.accessLog(socket, eventName, "ERROR");

        // エラーの内容はエラーログを見て欲しい（アクセスログはシンプルにしたい）
        const errorMessage = "message" in err ? err.message : err;
        this.core.log.errorLog(socket, eventName, errorMessage);

        if (resultEvent) socket.emit(resultEvent, err, null);
      }
    });
  }

  public async notifyProgress(socket: any, all: number, current: number): Promise<void> {
    if (all > 1) this.core.io.to(socket.id).emit("notify-progress", null, { all, current });
  }

  public async emitSocketEvent<T>(
    socket: any,
    sendTarget: "self" | "room" | "room-mate" | "all" | "other" | "none" | string[],
    event: string,
    error: any,
    payload: T
  ): Promise<void> {
    if (sendTarget === "none") return;
    if (typeof sendTarget !== "string") {
      await this.core.lib.gatlingAsync<void>(sendTarget.map(async t =>
        this.core.io.sockets.to(t).emit(event, error, payload)
      ));
      return;
    }
    if (sendTarget === "all") {
      return await this.core.io.sockets.emit(event, error, payload);
    }
    if (sendTarget === "self") {
      return await socket.emit(event, error, payload);
    }
    if (sendTarget === "other") {
      return await socket.broadcast.emit(event, error, payload);
    }

    const {socketInfoList} = await this.core._dbInner.getRoomMateSocketInfoList(socket);
    await this.core.lib.gatlingAsync(
      socketInfoList
        .filter((_, idx) => sendTarget === "room" ? true : idx > 0)
        .map(async info => this.core.io.sockets.to(info.socketId).emit(event, error, payload))
    );
  }
}
