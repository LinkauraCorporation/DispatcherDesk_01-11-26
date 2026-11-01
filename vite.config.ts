import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function leafletPosFixPlugin(): Plugin {
  return {
    name: 'leaflet-pos-fix',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('leaflet')) {
        let modified = code;
        if (modified.includes('return el._leaflet_pos || new Point(0, 0);')) {
          modified = modified.replaceAll(
            'return el._leaflet_pos || new Point(0, 0);',
            'return (el && el._leaflet_pos) || new Point(0, 0);'
          );
        }
        if (modified.includes('el._leaflet_pos = point;')) {
          modified = modified.replaceAll(
            'el._leaflet_pos = point;',
            'if (!el) return; el._leaflet_pos = point;'
          );
        }
        return { code: modified, map: null };
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    leafletPosFixPlugin(),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
  },
});
