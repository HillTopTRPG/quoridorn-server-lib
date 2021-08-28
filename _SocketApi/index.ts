import {SocketApiResistInfo} from "../index";

const map = new Map<string, SocketApiResistInfo>();

map.set("db-api-get", [(core, socket, arg) => core.socketApi.dbApiGet(socket, arg), arg => `db-api-get-${arg}`]);
map.set("db-api-insert", [(core, socket, arg) => core.socketApi.dbApiInsert(socket, arg), () => null]);
map.set("db-api-delete", [(core, socket, arg) => core.socketApi.dbApiDelete(socket, arg), () => null]);
map.set("db-api-update", [(core, socket, arg) => core.socketApi.dbApiUpdate(socket, arg), () => null]);
map.set("media-api-upload", [(core, socket, arg) => core.socketApi.mediaApiUpload(socket, arg), () => null]);
map.set("room-api-get-room-list", [(core, socket, arg) => core.socketApi.roomApiGetRoomList(socket, arg), () => null]);
map.set("room-api-touch-room", [(core, socket, arg) => core.socketApi.roomApiTouchRoom(socket, arg), () => null]);
map.set("room-api-create-room", [(core, socket, arg) => core.socketApi.roomApiCreateRoom(socket, arg), () => null]);
map.set("room-api-login-room", [(core, socket, arg) => core.socketApi.roomApiLoginRoom(socket, arg), () => null]);
map.set("room-api-login-user", [(core, socket, arg) => core.socketApi.roomApiLoginUser(socket, arg), () => null]);
map.set("room-api-delete-room", [(core, socket, arg) => core.socketApi.roomApiDeleteRoom(socket, arg), () => null]);
map.set("socket-api-emit-event", [(core, socket, arg) => core.socketApi.socketApiEmitEvent(socket, arg), () => null]);

export default map;
