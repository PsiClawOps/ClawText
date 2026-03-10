/**
 * Search API — /api/search
 */
import { Router } from 'express';

const router = Router();

export default function searchRoutes(memoryStore) {
  /**
   * GET /api/search?q=RGCS&limit=20&project=rgcs
   * Empty q returns most recent memories across all clusters.
   */
  router.get('/', (req, res) => {
    const { q = '', limit = 20, project } = req.query;
    const cap = Math.min(parseInt(limit), 100);

    let results;
    if (!q.trim()) {
      // No query → return recent memories sorted by date
      let all = memoryStore.memories
        .filter(m => m.title || m.content)
        .sort((a, b) => {
          const da = a.updatedAt || a.date || '';
          const db = b.updatedAt || b.date || '';
          return db.localeCompare(da);
        })
        .slice(0, cap);
      results = project ? all.filter(m => m.project === project) : all;
    } else {
      results = memoryStore.search(q, {
        limit: cap,
        projectFilter: project || null,
      });
    }

    res.json({
      query: q,
      total: results.length,
      results: results.map(r => ({
        id: r._id || r.id,
        content: r.content,
        title: r.title,
        project: r.project,
        type: r.type,
        date: r.date,
        clusterId: r.clusterId,
        clusterTopic: r.clusterTopic,
        entities: r.entities || [],
        keywords: r.keywords || [],
        score: r._score || 0,
      })),
    });
  });

  /**
   * GET /api/search/suggest?q=RG — typeahead suggestions
   * Requires at least 2 chars to avoid flooding with noise tokens.
   */
  router.get('/suggest', (req, res) => {
    const { q = '' } = req.query;
    if (q.trim().length < 2) return res.json({ suggestions: [] });

    const lower = q.toLowerCase();
    const entities = memoryStore.getAllEntities()
      .filter(e => {
        // Skip numeric tokens, URLs, version strings, single chars
        if (e.length < 2) return false;
        if (/^\d/.test(e)) return false;
        if (e.includes('/') || e.includes('.')) return false;
        return e.toLowerCase().startsWith(lower);
      })
      .slice(0, 10);
    res.json({ suggestions: entities });
  });

  return router;
}
