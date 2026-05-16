const fs = require('fs');
let content = fs.readFileSync('src/city.orig.js', 'utf8');

const getFunc = (name) => {
  const lines = content.split('\n');
  let start = -1;
  let end = -1;
  for(let i=0; i<lines.length; i++) {
    if (lines[i].startsWith(`  ${name}(`)) start = i;
    if (start !== -1 && lines[i] === '  }') {
      end = i;
      break;
    }
  }
  return lines.slice(start, end+1).join('\n');
};

const m1 = getFunc('_buildBuildingsFromModels');
const m2 = getFunc('_buildBuildingsSimple');
const m3 = getFunc('_addWindows');

let target = fs.readFileSync('src/city.js', 'utf8');

const replaceFunc = (name, replacement) => {
  const lines = target.split('\n');
  let start = -1;
  let end = -1;
  for(let i=0; i<lines.length; i++) {
    if (lines[i].startsWith(`  ${name}(`)) start = i;
    if (start !== -1 && lines[i] === '  }') {
      end = i;
      break;
    }
  }
  const oldText = lines.slice(start, end+1).join('\n');
  target = target.replace(oldText, replacement);
};

replaceFunc('_buildBuildingsFromModels', m1);
replaceFunc('_buildBuildingsSimple', m2);
replaceFunc('_addWindows', m3);

fs.writeFileSync('src/city.js', target);
