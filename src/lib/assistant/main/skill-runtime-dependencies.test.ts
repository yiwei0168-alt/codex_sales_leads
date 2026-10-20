import {expect,it} from 'vitest';
import {digest} from './contracts';
import {measureSkillRuntimeDependencies as measure} from './skill-runtime-dependencies';
const inventory={'node_modules/pkg/index.js':{sha256:digest('package bytes')},'node_modules/.bin/pkg':{link:'../pkg/index.js'},'runner.cjs':{sha256:digest('role-specific bundle')}};
it('binds actual dependency file bytes and links, while allowing role-specific artifacts',()=>{
 const first=measure(inventory,digest);
 expect(first.dependencyFiles).toBe(2);
 expect(measure({...inventory,'runner.cjs':{sha256:digest('other bundle')}},digest)).toEqual(first);
 expect(measure({...inventory,'node_modules/pkg/index.js':{sha256:digest('same version altered bytes')}},digest)).not.toEqual(first);
 expect(measure({...inventory,'node_modules/.bin/pkg':{link:'../pkg/other.js'}},digest)).not.toEqual(first);
});
it('is independent of inventory insertion order and serializes for in-image execution',()=>{
 expect(measure(Object.fromEntries(Object.entries(inventory).reverse()),digest)).toEqual(measure(inventory,digest));
 const inside=Function(`return (${measure.toString()})`)() as typeof measure;
 expect(inside(inventory,digest)).toEqual(measure(inventory,digest));
});
it.each([
 {'node_modules/../outside':{sha256:digest('x')}}, {'node_modules/pkg':{link:'../../runner.cjs'}},
 {'node_modules/pkg':{link:'/app/runner.cjs'}}, {'node_modules/pkg':{link:'..\\runner.cjs'}},
 {'node_modules/pkg':{sha256:'invalid'}}, {'node_modules/pkg':{sha256:digest('x'),link:'x'}}, {},
])('rejects malformed or escaping dependency inventory %j',files=>{
 expect(()=>measure(files,digest)).toThrow();
});
