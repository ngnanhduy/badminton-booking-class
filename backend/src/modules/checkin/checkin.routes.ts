import type { FastifyPluginAsync } from 'fastify'

import { ContactBody } from '../bookings/booking.schemas.js'
import { selfCheckIn } from './checkin.service.js'

export const checkinRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Self check-in with phone/email for a session booked today (POST so the contact never
   * appears in URLs/logs). Same strict limit as the other endpoints that take a contact.
   */
  app.post('/checkin', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request) => {
    const { contact } = ContactBody.parse(request.body)
    return selfCheckIn(app.deps, contact)
  })
}
