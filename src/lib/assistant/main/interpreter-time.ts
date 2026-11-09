/** Guest-only helper: never return a Date object or expose the native clock. */
export const INTERPRETER_ABI = 'interpreter-time-receipts-v2';
export const INTERPRETER_TIME_SETUP = String.raw`
  const NativeDate = Date;
  const utc = NativeDate.UTC.bind(NativeDate);
  const iso = Function.prototype.call.bind(NativeDate.prototype.toISOString);
  const getYear = Function.prototype.call.bind(NativeDate.prototype.getUTCFullYear);
  const getMonth = Function.prototype.call.bind(NativeDate.prototype.getUTCMonth);
  const getDay = Function.prototype.call.bind(NativeDate.prototype.getUTCDate);
  const isInteger = Number.isInteger;
  const time = (text, offsetMinutes) => {
    if (typeof text !== 'string') throw Error('time requires an explicit timestamp with timezone');
    if(offsetMinutes!==undefined&&(!isInteger(offsetMinutes)||offsetMinutes < -840||offsetMinutes > 840))
      throw Error('Grouping offset must be explicit integer minutes from -840 to 840');
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(text);
    if (!m) throw Error('Use YYYY-MM-DDTHH:mm:ss[.SSS]Z or an explicit numeric timezone offset');
    const y=+m[1], month=+m[2], day=+m[3], h=+m[4], min=+m[5], s=+m[6];
    const oh=+(m[10]||0), om=+(m[11]||0);
    if(y<100 || month<1 || month>12 || day<1 || day>31 || h>23 || min>59 || s>59 || oh>14 || om>59 || (oh===14 && om!==0))
      throw Error('Invalid timestamp components');
    const local=utc(y,month-1,day,h,min,s,+(m[7]||'').padEnd(3,'0'));
    const d=new NativeDate(local);
    if(getYear(d)!==y || getMonth(d)!==month-1 || getDay(d)!==day) throw Error('Invalid calendar date');
    const epochMs=local-(m[9]==='-'?-1:1)*(oh*60+om)*60000;
    const normalized={epochMs,utcIso:iso(new NativeDate(epochMs))};
    if(offsetMinutes!==undefined){
      const shifted=new NativeDate(epochMs+offsetMinutes*60000);
      if(getYear(shifted)<100||getYear(shifted)>9999)throw Error('Grouping date outside supported calendar');
      return Object.freeze({...normalized,offsetMinutes,localDate:iso(shifted).slice(0,10)});
    }
    return Object.freeze(normalized);
  };
`;
