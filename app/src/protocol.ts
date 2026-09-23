/** The untrusted WebSocket boundary. Identity is issued and verified by Room. */
export type ClientMessage =
  | { type: "join"; playerId?: string; token?: string; name?: string }
  | { type: "action"; action: unknown }
  | { type: "reset" };
export type ParseResult = {ok:true;msg:ClientMessage}|{ok:false;error:string};
function record(v:unknown):v is Record<string,unknown>{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
export function parseClientMessage(raw:string|ArrayBuffer):ParseResult {
  const fail=(error:string):ParseResult=>({ok:false,error});
  if(typeof raw!=="string")return fail("expected a text frame");
  if(new TextEncoder().encode(raw).byteLength>16384)return fail("message too large");
  let value:unknown;try{value=JSON.parse(raw);}catch{return fail("invalid json");}
  if(!record(value))return fail("expected a json object");
  if(value.type==="join"){
    const msg:Extract<ClientMessage,{type:"join"}>={type:"join"};
    if(value.playerId!==undefined){if(typeof value.playerId!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(value.playerId))return fail("invalid playerId");msg.playerId=value.playerId;}
    if(value.token!==undefined){if(typeof value.token!=="string"||!/^[A-Za-z0-9-]{20,100}$/.test(value.token))return fail("invalid reconnect token");msg.token=value.token;}
    if(value.name!==undefined){if(typeof value.name!=="string"||!value.name.trim()||value.name.length>24||/[<>\x00-\x1f]/.test(value.name))return fail("use a name of 1–24 plain characters");msg.name=value.name.trim();}
    return {ok:true,msg};
  }
  if(value.type==="action"){
    if(!record(value.action))return fail("action must be an object");
    if(new TextEncoder().encode(JSON.stringify(value.action)).byteLength>4096)return fail("action too large");
    return {ok:true,msg:{type:"action",action:value.action}};
  }
  if(value.type==="reset")return {ok:true,msg:{type:"reset"}};
  return fail("unknown message type");
}
