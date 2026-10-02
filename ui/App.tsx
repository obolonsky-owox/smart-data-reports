import type { PluginContext } from '@owox/plugin-sdk';

export function App(_props: { context: PluginContext }) {
  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Reports</h1>
      </header>
    </div>
  );
}
