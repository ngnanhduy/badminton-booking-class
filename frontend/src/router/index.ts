import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/auth'
import BookingView from '@/views/BookingView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** i18n key of the page title (`titles.*`); App.vue sets document.title. */
    titleKey?: string
    /** Only signed-in staff. */
    requiresAuth?: boolean
    /** Only signed-in users with one of these roles (implies requiresAuth). */
    roles?: readonly Role[]
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'booking', component: BookingView, meta: { titleKey: 'titles.booking' } },
    {
      path: '/sua-lich',
      name: 'edit',
      component: () => import('@/views/EditBookingView.vue'),
      meta: { titleKey: 'titles.edit' },
    },
    {
      path: '/quyen-rieng-tu',
      name: 'privacy',
      component: () => import('@/views/PrivacyView.vue'),
      meta: { titleKey: 'titles.privacy' },
    },
    {
      path: '/lich-tuan',
      name: 'schedule',
      // Route-level code splitting: loaded only when visited.
      component: () => import('@/views/ScheduleView.vue'),
      meta: { titleKey: 'titles.schedule' },
    },
    {
      path: '/dang-nhap',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { titleKey: 'titles.login' },
    },
    {
      path: '/tai-khoan',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { titleKey: 'titles.account', requiresAuth: true },
    },
    {
      path: '/quan-tri',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { titleKey: 'titles.admin', roles: ['admin'] },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { titleKey: 'titles.notFound' },
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

/**
 * Sends visitors to the sign-in page when a page needs an account or a role. This is only
 * UX: the API checks the session and role on every request.
 */
export async function authGuard(to: RouteLocationNormalized) {
  if (!to.meta.requiresAuth && !to.meta.roles) return true
  const auth = useAuthStore()
  await auth.load()
  if (!auth.user) return { name: 'login', query: { returnTo: to.fullPath } }
  if (to.meta.roles && !auth.hasRole(to.meta.roles)) {
    return { name: 'login', query: { error: 'forbidden' } }
  }
  return true
}

router.beforeEach(authGuard)

export default router
