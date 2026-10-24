import { createRouter, createWebHistory } from 'vue-router';
import { api } from './api';
import { session } from './session';
import LoginPage from './pages/LoginPage.vue';
import SystemsPage from './pages/SystemsPage.vue';
import SystemDetailPage from './pages/SystemDetailPage.vue';

export const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', redirect: '/sistemas' },
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true } },
    { path: '/sistemas', name: 'systems', component: SystemsPage },
    { path: '/sistemas/:id', name: 'system', component: SystemDetailPage, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/sistemas' },
  ],
});

router.beforeEach(async (to) => {
  if (!session.username) {
    try {
      const me = await api<{ username: string }>('/admin-session/me');
      session.username = me.username;
    } catch {
      // No valid session
    }
  }

  if (to.meta.public) {
    return session.username ? { name: 'systems' } : true;
  }

  if (!session.username) {
    return { name: 'login', query: to.fullPath === '/sistemas' ? {} : { redirect: to.fullPath } };
  }
  return true;
});
