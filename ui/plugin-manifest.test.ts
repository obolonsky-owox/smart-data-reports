import manifest from '../plugin.json';

describe('plugin.json', () => {
  it('serves from GitHub Pages, never from a tunnel', () => {
    expect(manifest.delivery).toEqual({
      type: 'remote',
      url: 'https://obolonsky-owox.github.io/smart-data-reports/',
    });
  });

  it('keeps the released collection declarations unchanged', () => {
    // Released collections can never change name, scope or entityBinding; new ones may only be added.
    expect(manifest.collections).toEqual([
      {
        name: 'reports',
        scope: 'project',
        entityBinding: {
          type: 'data-mart',
          actions: { read: 'USE', create: 'USE', update: 'USE', delete: 'USE' },
        },
      },
      {
        // Results hold rows of joined data marts too, so each member keeps their own.
        name: 'snapshots',
        scope: 'member',
        entityBinding: {
          type: 'data-mart',
          actions: { read: 'USE', create: 'USE', update: 'USE', delete: 'USE' },
        },
      },
    ]);
  });
});
