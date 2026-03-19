import { NextRequest } from 'next/server'

export const runtime = 'edge'

type VideoResult = {
  id: string
  title: string
  channel: string
  thumbnail: string
  url: string
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q) return Response.json([])

  try {
    const html = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%3D%3D`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    ).then((r) => r.text())

    // Extract unique 11-char video IDs from YouTube's embedded JSON
    const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)]
      .map((m) => m[1])
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 3)

    if (ids.length === 0) return Response.json([])

    // Resolve title + channel via oEmbed (free, no API key)
    const videos: VideoResult[] = (
      await Promise.all(
        ids.map(async (id) => {
          try {
            const oembed = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
            ).then((r) => r.json())
            return {
              id,
              title: oembed.title as string,
              channel: oembed.author_name as string,
              thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${id}`,
            } satisfies VideoResult
          } catch {
            return null
          }
        }),
      )
    ).filter((v): v is VideoResult => v !== null)

    return Response.json(videos)
  } catch {
    return Response.json([])
  }
}
