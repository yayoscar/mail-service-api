import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { setUnauthorizedHandler } from './api';
import { router } from './router';
import { session } from './session';

setUnauthorizedHandler(() => {
  session.username = null;
  session.notice = 'Tu sesión terminó. Inicia sesión de nuevo.';
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    router.push({ name: 'login', query: { redirect: current.fullPath } });
  }
});

createApp(App).use(router).mount('#app');
