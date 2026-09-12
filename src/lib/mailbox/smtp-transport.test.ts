import {EventEmitter} from "node:events";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({lookup:vi.fn(),connect:vi.fn(),create:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:m.lookup}));
vi.mock("node:tls",()=>({connect:m.connect}));
vi.mock("nodemailer",()=>({default:{createTransport:m.create}}));
import {connectSmtpTls,createSmtpTransport} from "./smtp-transport";
beforeEach(()=>{vi.resetAllMocks();m.lookup.mockResolvedValue([{address:"192.0.2.1"},{address:"192.0.2.2"}]);});
afterEach(()=>vi.useRealTimers());
function socket(error?:string){const s=Object.assign(new EventEmitter(),{destroy:vi.fn()});queueMicrotask(()=>s.emit(error?"error":"secureConnect",error?Object.assign(new Error("fixture"),{code:error}):undefined));return s;}
it("uses system addresses with original hostname validation and retries only before handoff",async()=>{
  m.connect.mockImplementationOnce(()=>socket("ECONNREFUSED")).mockImplementationOnce(()=>socket());
  await connectSmtpTls("smtp.example.test");
  expect(m.lookup).toHaveBeenCalledWith("smtp.example.test",{all:true});
  expect(m.connect.mock.calls.map(c=>c[0].host)).toEqual(["192.0.2.1","192.0.2.2"]);
  expect(m.connect.mock.calls[1][0]).toMatchObject({servername:"smtp.example.test",rejectUnauthorized:true,port:465});
});
it("never bypasses a certificate failure",async()=>{
  m.connect.mockImplementation(()=>socket("ERR_TLS_CERT_ALTNAME_INVALID"));
  await expect(connectSmtpTls("smtp.example.test")).rejects.toMatchObject({code:"ERR_TLS_CERT_ALTNAME_INVALID"});expect(m.connect).toHaveBeenCalledTimes(1);
});
it("deduplicates and bounds address attempts to four",async()=>{
  m.lookup.mockResolvedValue(Array.from({length:10},(_,i)=>({address:`192.0.2.${Math.floor(i/2)}`})));
  m.connect.mockImplementation(()=>socket("ECONNRESET"));
  await expect(connectSmtpTls("smtp.example.test")).rejects.toMatchObject({code:"ECONNRESET"});expect(m.connect).toHaveBeenCalledTimes(4);
});
it("bounds DNS resolution without starting a connection",async()=>{
  vi.useFakeTimers();m.lookup.mockReturnValue(new Promise(()=>{}));
  const check=expect(connectSmtpTls("smtp.example.test")).rejects.toMatchObject({code:"EDNS"});
  await vi.advanceTimersByTimeAsync(5000);await check;expect(m.connect).not.toHaveBeenCalled();
});
it("hands a secured socket to nodemailer once, without authenticating in the connector",async()=>{
  m.connect.mockImplementation(()=>socket());createSmtpTransport({user:"fixture",pass:"fixture"});
  const options=m.create.mock.calls[0][0];const callback=vi.fn();
  options.getSocket({},callback);await vi.waitFor(()=>expect(callback).toHaveBeenCalledTimes(1));
  expect(callback.mock.calls[0][1].secured).toBe(true);expect(options.tls.rejectUnauthorized).toBe(true);expect(options.debug).toBe(false);
});
