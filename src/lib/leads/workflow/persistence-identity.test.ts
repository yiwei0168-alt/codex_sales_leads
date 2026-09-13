import { describe, expect, it } from "vitest";
import { persistenceInputFingerprint as fingerprint } from "./persistence-identity";

describe("persisted result identity", () => {
  it("survives JSON round trips and nested object key reordering", () => {
    expect(fingerprint({a:1,b:{x:2,y:3},unused:undefined})).toBe(fingerprint({b:{y:3,x:2},a:1}));
  });
  it("distinguishes result order, nulls, country and score changes", () => {
    const input={country:"CO",scores:[1,2],value:null};
    for(const changed of [{...input,country:"MX"},{...input,scores:[2,1]},
      {...input,scores:[1,3]},{...input,value:undefined}]) {
      expect(fingerprint(changed)).not.toBe(fingerprint(input));
    }
  });
});
