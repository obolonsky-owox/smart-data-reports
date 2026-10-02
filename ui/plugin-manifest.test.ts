import manifest from '../plugin.json';

describe('plugin.json', () => {
  it('serves from GitHub Pages, never from a tunnel', () => {
    expect(manifest.delivery).toEqual({
      type: 'remote',
      url: 'https://owox.github.io/smart-data-reports/',
    });
  });

  it('keeps the released collection declaration unchanged', () => {
    // Released collections can never change name, scope or entityBinding.
    expect(manifest.collections).toEqual([
      {
        name: 'reports',
        scope: 'project',
        entityBinding: {
          type: 'data-mart',
          actions: { read: 'USE', create: 'USE', update: 'USE', delete: 'USE' },
        },
      },
    ]);
  });
});
