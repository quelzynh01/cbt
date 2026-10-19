import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // ref/ guarda PDFs e imagens de referência (não fazem parte do jogo): não vigiar
    watch: { ignored: ['**/ref/**', '**/dist/**', '**/tools/**'] },
  },
});
