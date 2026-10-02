import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadSettings(stored?: string) {
  vi.resetModules();
  const saved = new Map<string, string>();
  if (stored != null) saved.set('silly-park:settings:v1', stored);
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v)
    }
  });
  const mod = await import('../../src/game/settings');
  return { ...mod, saved };
}

describe('graphics auto-detect', () => {
  it('picks a level from the renderer name', async () => {
    const { detectQuality } = await loadSettings();
    expect(detectQuality('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)', false)).toBe('ultra');
    expect(detectQuality('ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11)', false)).toBe('ultra');
    expect(detectQuality('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', false)).toBe('high');
    expect(detectQuality('ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11)', false)).toBe('high');
    expect(detectQuality('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', false)).toBe('low');
    expect(detectQuality('Apple M3', true)).toBe('high');
  });
});

describe('settings', () => {
  it('ignores broken or unknown saved values', async () => {
    const { settings } = await loadSettings('{"speed":7,"magic":2,"rumble":"yes","quality":"extreme","chase":"hard"}');
    const s = settings();
    expect(s.speed).toBe(1);
    expect(s.magic).toBe(2);
    expect(s.rumble).toBe(true);
    expect(s.quality).toBe('auto');
    expect(s.chase).toBe('auto');
    expect(s.zoom).toBe(1);
    expect((await loadSettings('{"chase":2}')).settings().chase).toBe(2);
    expect((await loadSettings('{"zoom":4}')).settings().zoom).toBe(1.6);
    expect((await loadSettings('{"zoom":"big"}')).settings().zoom).toBe(1);
    expect((await loadSettings('{"zoom":0.8}')).settings().zoom).toBe(0.8);
    expect(s.split).toBe(true);
    expect((await loadSettings('{"split":false}')).settings().split).toBe(false);
    expect((await loadSettings('{"split":"no"}')).settings().split).toBe(true);
  });

  it('survives unreadable storage', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      location: { search: '' },
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('full');
        }
      }
    });
    const { settings, useSettings } = await import('../../src/game/settings');
    expect(settings().speed).toBe(1);
    expect(() => useSettings.getState().set({ speed: 0 })).not.toThrow();
    expect(settings().speed).toBe(0);
  });

  it('remembers changes', async () => {
    const { useSettings, saved } = await loadSettings();
    useSettings.getState().set({ together: 2, quality: 'ultra' });
    expect(JSON.parse(saved.get('silly-park:settings:v1')!)).toMatchObject({ together: 2, quality: 'ultra' });
  });

  it('auto uses what was detected', async () => {
    const { useSettings, effectiveQuality } = await loadSettings();
    useSettings.getState().setDetected('ultra', 'RTX');
    expect(effectiveQuality()).toBe('ultra');
    useSettings.getState().set({ quality: 'low' });
    expect(effectiveQuality()).toBe('low');
  });
});

describe('render resolution', () => {
  it('ultra supersamples ordinary screens up to 4K wide, and never goes below the screen', async () => {
    const { qualityDpr } = await loadSettings();
    expect(qualityDpr('ultra', 1, 1920)).toBe(2); // 1080p: 3840 wide
    expect(qualityDpr('ultra', 1, 2560)).toBe(1.5); // 1440p: 3840 wide
    expect(qualityDpr('ultra', 1, 3840)).toBe(1); // 4K at 100%: native
    expect(qualityDpr('ultra', 1.5, 2560)).toBe(1.5); // 4K at 150%: native
    expect(qualityDpr('ultra', 2, 2560)).toBe(2); // 5K retina: native
    expect(qualityDpr('high', 1, 1920)).toEqual([1, 1.75]);
    expect(qualityDpr('low', 2, 1280)).toBe(1);
  });
});
