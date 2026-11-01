const fs = require('fs');
const path = require('path');

function patchFile(filePath, patches) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  // Clean any accidental double-guards first
  if (content.includes('if (!el) return; if (!el) return;')) {
    content = content.replaceAll(/if \(!el\) return;\s*if \(!el\) return;/g, 'if (!el) return;');
    changed = true;
  }
  if (content.includes('if(!t)return;if(!t)return;')) {
    content = content.replaceAll(/if\(!t\)return;\s*if\(!t\)return;/g, 'if(!t)return;');
    changed = true;
  }

  for (const { check, target, replacement } of patches) {
    if (check && content.includes(check)) {
      continue;
    }
    if (content.includes(target)) {
      content = content.replaceAll(target, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[patch-leaflet] Successfully updated ${filePath}`);
  }
}

const standardFiles = [
  'node_modules/leaflet/dist/leaflet-src.esm.js',
  'node_modules/leaflet/dist/leaflet-src.js',
  'node_modules/leaflet/src/dom/DomUtil.js',
  'node_modules/.vite/deps/leaflet.js',
];

for (const file of standardFiles) {
  patchFile(file, [
    {
      check: 'return (el && el._leaflet_pos) || new Point(0, 0);',
      target: 'return el._leaflet_pos || new Point(0, 0);',
      replacement: 'return (el && el._leaflet_pos) || new Point(0, 0);',
    },
    {
      check: 'if (!el) return; el._leaflet_pos = point;',
      target: 'el._leaflet_pos = point;',
      replacement: 'if (!el) return; el._leaflet_pos = point;',
    },
  ]);
}

patchFile('node_modules/leaflet/dist/leaflet.js', [
  {
    check: 'return (t&&t._leaflet_pos)||new p(0,0)',
    target: 'return t._leaflet_pos||new p(0,0)',
    replacement: 'return (t&&t._leaflet_pos)||new p(0,0)',
  },
  {
    check: 'if(!t)return;t._leaflet_pos=e,b.any3d?',
    target: 't._leaflet_pos=e,b.any3d?',
    replacement: 'if(!t)return;t._leaflet_pos=e,b.any3d?',
  },
]);

console.log('[patch-leaflet] Leaflet patching check completed.');
