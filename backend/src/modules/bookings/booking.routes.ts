import type { FastifyPluginAsync } from 'fastify'

import { getSchedule } from '../schedule/schedule.service.js'
import { ContactBody, SubmitBookingBody } from './booking.schemas.js'
import { deleteBookingByContact, lookupBooking, submitBooking } from './booking.service.js'

/** Stricter limit for endpoints that take a phone/email, to slow down guessing. */
const CONTACT_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '10 minutes' } }

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  /** Create or update this week's booking. */
  app.post('/bookings', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const input = SubmitBookingBody.parse(request.body)
    const result = await submitBooking(app.deps, input)
    const config = await getSchedule(app.deps.db, app.deps.config)
    return reply.status(result.updated ? 200 : 201).send({ updated: result.updated, config })
  })

  /** Look up this week's booking by phone/email (POST so the contact never appears in URLs/logs). */
  app.post('/bookings/lookup', { config: CONTACT_RATE_LIMIT }, async (request) => {
    const { contact } = ContactBody.parse(request.body)
    return { booking: await lookupBooking(app.deps, contact) }
  })

  /** Delete this week's booking and its personal data. */
  app.post('/bookings/delete', { config: CONTACT_RATE_LIMIT }, async (request) => {
    const { contact } = ContactBody.parse(request.body)
    await deleteBookingByContact(app.deps, contact)
    return { deleted: true, config: await getSchedule(app.deps.db, app.deps.config) }
  })
}
