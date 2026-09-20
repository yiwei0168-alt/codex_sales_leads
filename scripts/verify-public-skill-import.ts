import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {loadSkillSource} from "../src/lib/assistant/main/skill-sources";

const repository="https://github.com/openai/skills";
const directory="skills/.curated/security-best-practices";
const direct=`https://raw.githubusercontent.com/openai/skills/main/${directory}/SKILL.md`;
const single=await loadSkillSource({kind:"url",name:"Public validation fixture",url:direct});
const packageVersion=await loadSkillSource({kind:"github",name:"Public validation fixture",repository,ref:"main",directory});
assert(single.files["SKILL.md"].length>100);
assert(packageVersion.files["SKILL.md"].length>100);
assert(packageVersion.source.startsWith("github:openai/skills@"));
console.log(JSON.stringify({status:"pass",urlFiles:Object.keys(single.files).length,gitFiles:Object.keys(packageVersion.files).length,
  pinnedCommit:packageVersion.source.match(/@([a-f0-9]{40})/)?.[1],contentHash:createHash("sha256").update(JSON.stringify(packageVersion.files)).digest("hex"),
  privateInputs:0,databaseWrites:0,scriptExecutions:0}));
