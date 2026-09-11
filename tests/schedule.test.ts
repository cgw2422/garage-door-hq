import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  ScheduleError,
  assignJob,
  loadSchedule,
  loadUpcoming,
  rescheduleJob,
} from '@/server/schedule/service'
import { createTestCompany, createTestDoor } from './helpers'
import { addTestMember } from './helpers'

/**
 * The schedule.
 *
 * Two properties matter here. One company's board must never contain another
 * company's work, and the scope of a technician's board is decided from the
 * session role rather than from anything the request can carry.
 */

async function scheduledJob(
  session: AppSession,
  options: { at: Date; assignedToId?: string | null; status?: 'DRAFT' | 'SCHEDULED' },
) {
  const { customer, property, door } = await createTestDoor(session)
  return prisma.job.create({
    data: {
      organizationId: session.organizationId,
      number: Math.floor(Math.random() * 1_000_000),
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
      assignedToId:
        options.assignedToId === undefined ? session.userId : options.assignedToId,
      status: options.status ?? 'SCHEDULED',
      scheduledStart: options.at,
      scheduledEnd: new Date(options.at.getTime() + 90 * 60_000),
    },
  })
}

/** A fixed mid-morning instant, well away from any timezone boundary. */
function at(day: string, hourUtc = 15) {
  return new Date(`${day}T${String(hourUtc).padStart(2, '0')}:00:00.000Z`)
}

describe('tenant isolation', () => {
  it('never shows another company’s jobs on the board', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const mine = await scheduledJob(a, { at: at('2026-03-10') })
    const theirs = await scheduledJob(b, { at: at('2026-03-10') })

    const board = await loadSchedule(a, { fromDate: '2026-03-09', toDate: '2026-03-12' })
    const ids = board.map((job) => job.id)

    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
  })

  it('cannot reschedule another company’s job', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const theirs = await scheduledJob(b, { at: at('2026-03-10') })

    await expect(
      rescheduleJob(a, { jobId: theirs.id, date: '2026-03-11', time: '09:00' }),
    ).rejects.toThrow(ScheduleError)

    const unchanged = await prisma.job.findUniqueOrThrow({ where: { id: theirs.id } })
    expect(unchanged.scheduledStart!.toISOString()).toBe(at('2026-03-10').toISOString())
  })

  it('cannot assign a job to someone outside the company', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const job = await scheduledJob(a, { at: at('2026-03-10') })

    await expect(assignJob(a, job.id, b.userId)).rejects.toThrow(/not on your team/i)

    const unchanged = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(unchanged.assignedToId).toBe(a.userId)
  })

  it('cannot assign a deactivated member', async () => {
    const { session: owner } = await createTestCompany()
    const retired = await addTestMember(owner, 'TECHNICIAN', { isActive: false })
    const job = await scheduledJob(owner, { at: at('2026-03-10') })

    await expect(assignJob(owner, job.id, retired.userId)).rejects.toThrow(
      /not on your team/i,
    )
  })
})

describe('board scope', () => {
  it('shows a technician only their own work, whatever the request asks for', async () => {
    const { session: owner } = await createTestCompany({ companySize: 'SMALL_2_5' })
    const tech = await addTestMember(owner, 'TECHNICIAN')

    const ownersJob = await scheduledJob(owner, { at: at('2026-04-01') })
    const techsJob = await scheduledJob(owner, {
      at: at('2026-04-01', 17),
      assignedToId: tech.userId,
    })

    // The technician asks, in effect, to see the owner's board.
    const board = await loadSchedule(tech, {
      fromDate: '2026-03-31',
      toDate: '2026-04-02',
      technicianId: owner.userId,
    })

    const ids = board.map((job) => job.id)
    expect(ids).toEqual([techsJob.id])
    expect(ids).not.toContain(ownersJob.id)
  })

  it('shows an owner everyone’s work, and filters only when asked', async () => {
    const { session: owner } = await createTestCompany({ companySize: 'SMALL_2_5' })
    const tech = await addTestMember(owner, 'TECHNICIAN')

    const ownersJob = await scheduledJob(owner, { at: at('2026-04-05') })
    const techsJob = await scheduledJob(owner, {
      at: at('2026-04-05', 17),
      assignedToId: tech.userId,
    })

    const everyone = await loadSchedule(owner, {
      fromDate: '2026-04-04',
      toDate: '2026-04-06',
    })
    expect(everyone.map((job) => job.id).sort()).toEqual([ownersJob.id, techsJob.id].sort())

    const filtered = await loadSchedule(owner, {
      fromDate: '2026-04-04',
      toDate: '2026-04-06',
      technicianId: tech.userId,
    })
    expect(filtered.map((job) => job.id)).toEqual([techsJob.id])
  })

  it('gives the office everyone’s work too', async () => {
    const { session: owner } = await createTestCompany({ companySize: 'SMALL_2_5' })
    const office = await addTestMember(owner, 'OFFICE')
    const tech = await addTestMember(owner, 'TECHNICIAN')
    await scheduledJob(owner, { at: at('2026-04-08'), assignedToId: tech.userId })

    const board = await loadSchedule(office, {
      fromDate: '2026-04-07',
      toDate: '2026-04-09',
    })
    expect(board).toHaveLength(1)
    expect(board[0]!.technicianId).toBe(tech.userId)
  })
})

describe('the board itself', () => {
  it('groups by the company’s day, not the server’s', async () => {
    const { session } = await createTestCompany()
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { timezone: 'America/Los_Angeles' },
    })
    const pacific: AppSession = { ...session, timezone: 'America/Los_Angeles' }

    // 02:00 UTC on the 13th is 19:00 on the 12th in Los Angeles.
    const job = await scheduledJob(pacific, { at: new Date('2026-05-13T02:00:00.000Z') })

    const board = await loadSchedule(pacific, {
      fromDate: '2026-05-11',
      toDate: '2026-05-14',
    })
    const found = board.find((entry) => entry.id === job.id)
    expect(found?.dateKey).toBe('2026-05-12')
  })

  it('leaves out archived jobs', async () => {
    const { session } = await createTestCompany()
    const job = await scheduledJob(session, { at: at('2026-06-01') })
    await prisma.job.update({ where: { id: job.id }, data: { archivedAt: new Date() } })

    const board = await loadSchedule(session, { fromDate: '2026-05-31', toDate: '2026-06-02' })
    expect(board.map((entry) => entry.id)).not.toContain(job.id)
  })

  it('carries the customer and address a technician needs to drive there', async () => {
    const { session } = await createTestCompany()
    await scheduledJob(session, { at: at('2026-06-10') })

    const board = await loadSchedule(session, { fromDate: '2026-06-09', toDate: '2026-06-11' })
    expect(board[0]!.customerName).toBe('Sam Tester')
    expect(board[0]!.addressLine).toBe('1 Test Ln, Charlotte')
  })

  it('looks ahead a fixed window for the Upcoming list', async () => {
    const { session } = await createTestCompany()
    const soon = await scheduledJob(session, { at: at('2026-07-03') })
    const later = await scheduledJob(session, { at: at('2026-08-20') })

    const upcoming = await loadUpcoming(session, '2026-07-01', 14)
    const ids = upcoming.map((entry) => entry.id)
    expect(ids).toContain(soon.id)
    expect(ids).not.toContain(later.id)
  })
})

describe('rescheduling', () => {
  it('moves a job and keeps its original duration', async () => {
    const { session } = await createTestCompany()
    const job = await scheduledJob(session, { at: at('2026-09-01') })

    const moved = await rescheduleJob(session, {
      jobId: job.id,
      date: '2026-09-03',
      time: '08:30',
    })

    const minutes =
      (moved.scheduledEnd!.getTime() - moved.scheduledStart!.getTime()) / 60_000
    expect(minutes).toBe(90)

    const board = await loadSchedule(session, { fromDate: '2026-09-02', toDate: '2026-09-04' })
    expect(board.map((entry) => entry.id)).toContain(job.id)
  })

  it('turns a draft into a real booking once it has a time', async () => {
    const { session } = await createTestCompany()
    const { customer, property } = await createTestDoor(session)
    const draft = await prisma.job.create({
      data: {
        organizationId: session.organizationId,
        number: Math.floor(Math.random() * 1_000_000),
        customerId: customer.id,
        propertyId: property.id,
        status: 'DRAFT',
      },
    })

    const booked = await rescheduleJob(session, {
      jobId: draft.id,
      date: '2026-09-09',
      time: '13:00',
      durationMinutes: 45,
    })

    expect(booked.status).toBe('SCHEDULED')
    expect(
      (booked.scheduledEnd!.getTime() - booked.scheduledStart!.getTime()) / 60_000,
    ).toBe(45)
  })

  it('refuses to reschedule a completed job', async () => {
    const { session } = await createTestCompany()
    const job = await scheduledJob(session, { at: at('2026-09-15') })
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    await expect(
      rescheduleJob(session, { jobId: job.id, date: '2026-09-16', time: '10:00' }),
    ).rejects.toThrow(/completed job/i)
  })

  it('records who moved the job', async () => {
    const { session } = await createTestCompany()
    const job = await scheduledJob(session, { at: at('2026-10-01') })
    await rescheduleJob(session, { jobId: job.id, date: '2026-10-02', time: '11:15' })

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: session.organizationId,
        action: 'job.rescheduled',
        entityId: job.id,
      },
    })
    expect(audit?.actorUserId).toBe(session.userId)
  })

  it('unassigns without complaint when work comes off a technician', async () => {
    const { session: owner } = await createTestCompany({ companySize: 'SMALL_2_5' })
    const tech = await addTestMember(owner, 'TECHNICIAN')
    const job = await scheduledJob(owner, {
      at: at('2026-10-10'),
      assignedToId: tech.userId,
    })

    const updated = await assignJob(owner, job.id, null)
    expect(updated.assignedToId).toBeNull()
  })
})
