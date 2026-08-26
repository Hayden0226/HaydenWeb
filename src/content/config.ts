import { defineCollection, z } from 'astro:content';

// Canonical status type constants - single source of truth
export const ANIME_STATUSES = ['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'] as const;
export type AnimeStatus = typeof ANIME_STATUSES[number];

export const BOOK_STATUSES = ['reading', 'finished', 'want-to-read'] as const;
export type BookStatus = typeof BOOK_STATUSES[number];

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    technologies: z.array(z.string()).optional().default([]),
    links: z.object({
      github: z.string().url().optional(),
      demo: z.string().url().optional(),
      website: z.string().url().optional(),
    }).optional(),
    featured: z.boolean().optional().default(false),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    image: z.string().optional(),
  }),
});

const books = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string(),
    coverImage: z.string(),
    rating: z.number().min(1).max(5).optional(),
    status: z.enum(['reading', 'finished', 'want-to-read']).default('finished'),
    dateRead: z.coerce.date().optional(),
    thoughts: z.string().optional(),
    featured: z.boolean().optional().default(false),
  }),
});

export const collections = {
  projects,
  books,
};
