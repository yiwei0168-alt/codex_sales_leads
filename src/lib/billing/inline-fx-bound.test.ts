import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("./fresh-fx-reference",()=>({readFreshCnyFxReference:mocks.read}));
import {nativeModelBound} from "./native-model-bound";
import {embeddingModelBound} from "./embedding-model-bound";
it("both default model quote paths refresh at the same observed time and fail closed without a reference",async()=>{
  const now=Date.parse("2026-09-13T01:00:00Z");
  mocks.read.mockResolvedValue(null);
  await expect(nativeModelBound({origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model:"kimi-k2.6",requestBytes:100,outputTokens:100},now)).rejects.toThrow("expired-tariff");
  await expect(embeddingModelBound({origin:"https://synthetic.cn-beijing.maas.aliyuncs.com",pathname:"/compatible-mode/v1/embeddings",model:"text-embedding-v4",requestBytes:100,outputTokens:null},now)).rejects.toThrow("expired-tariff");
  expect(mocks.read.mock.calls).toEqual([[now],[now]]);
});
