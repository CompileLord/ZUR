export interface DerivedVideoEmbed {
  embedUrl: string | null;
  provider: 'youtube' | 'vimeo' | 'loom' | null;
}

export function deriveEmbedUrl(videoUrl: string): DerivedVideoEmbed {
  if (!videoUrl || typeof videoUrl !== 'string') {
    return { embedUrl: null, provider: null };
  }

  const trimmed = videoUrl.trim();

  // YouTube: youtube.com/watch?v=ID or youtu.be/ID
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  if (ytMatch) {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
      provider: 'youtube',
    };
  }

  // Vimeo: vimeo.com/ID
  const vimeoMatch = trimmed.match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/i
  );
  if (vimeoMatch) {
    const id = vimeoMatch[3] || vimeoMatch[1];
    return {
      embedUrl: `https://player.vimeo.com/video/${id}`,
      provider: 'vimeo',
    };
  }

  // Loom: loom.com/share/ID
  const loomMatch = trimmed.match(/loom\.com\/share\/([a-zA-Z0-9]+)/i);
  if (loomMatch) {
    return {
      embedUrl: `https://www.loom.com/embed/${loomMatch[1]}`,
      provider: 'loom',
    };
  }

  return { embedUrl: null, provider: null };
}
