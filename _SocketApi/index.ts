import {SocketApiFunc} from "../index";

const map = new Map<string, SocketApiFunc>();

map.set("db-api-insert", (core, socket, arg) => core.socketApi.dbApiInsert(socket, arg));
map.set("db-api-delete", (core, socket, arg) => core.socketApi.dbApiDelete(socket, arg));
map.set("db-api-update", (core, socket, arg) => core.socketApi.dbApiUpdate(socket, arg));
map.set("media-api-upload", (core, socket, arg) => core.socketApi.mediaApiUpload(socket, arg));
map.set("room-api-get-room-list", (core, socket, arg) => core.socketApi.roomApiGetRoomList(socket, arg));
map.set("room-api-touch-room", (core, socket, arg) => core.socketApi.roomApiTouchRoom(socket, arg));
map.set("room-api-create-room", (core, socket, arg) => core.socketApi.roomApiCreateRoom(socket, arg));
map.set("room-api-login-room", (core, socket, arg) => core.socketApi.roomApiGetLoginRoom(socket, arg));
map.set("room-api-login-user", (core, socket, arg) => core.socketApi.roomApiGetLoginUser(socket, arg));
map.set("room-api-delete-room", (core, socket, arg) => core.socketApi.roomApiDeleteRoom(socket, arg));
map.set("socket-api-emit-event", (core, socket, arg) => core.socketApi.socketApiEmitEvent(socket, arg));

export default map;
