'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const fallback = [
  ['Lightning Roulette', 'Evolution', '⚡', 'lightning-roulette'],
  ['Live Blackjack', 'Evolution', '🃏', 'live-blackjack'],
  ['Live Baccarat', 'Evolution', '♦️', 'live-baccarat'],
  ['Crazy Time', 'Evolution', '🎡', 'crazy-time'],
  ['Live Roulette', 'Pragmatic Play', '🎯', 'live-roulette'],
  ['Live Casino VIP', 'Cassanova', '👑', 'live-casino-vip'],
];

export default function LiveCasinoPage() {
  const [games, setGames] = useState<any[]>(fallback.map(([title, provider, thumbnail, slug]) => ({ title, provider, thumbnail, slug })));

  useEffect(() => {
    api.games.getAll({ category: 'live-casino' }).then((data) => {
      if (Array.isArray(data) && data.length) setGames(data);
    }).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="rounded-3xl bg-gradient-to-r from-purple-900 via-fuchsia-900 to-gray-900 p-8 md:p-14 mb-10 text-center">
          <div className="text-5xl mb-4">🎥</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Live Casino</h1>
          <p className="text-gray-300">Experience live-style casino tables and game rooms.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {games.map((game) => (
            <Link key={game._id || game.slug} href={`/games/${game.slug || game._id}`}
              className="group bg-gray-900 rounded-2xl overflow-hidden border border-white/10 hover:border-yellow-500/50 transition">
              <div className="aspect-video bg-gradient-to-br from-red-900 via-purple-800 to-black flex items-center justify-center text-6xl group-hover:scale-105 transition">
                {game.thumbnail || '🎥'}
              </div>
              <div className="p-4">
                <h2 className="font-bold truncate">{game.title}</h2>
                <p className="text-sm text-gray-400 mt-1">{game.provider}</p>
                <div className="mt-4 w-full text-center py-2 rounded-lg bg-yellow-500 text-gray-950 font-bold">View Game</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
