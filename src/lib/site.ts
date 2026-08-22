/** Site-wide constants. All environment-configurable values live here. */
export const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL || 'https://lakkev.com'
).replace(/\/$/, '');
export const CONTACT_EMAIL = import.meta.env.PUBLIC_CONTACT_EMAIL || 'contact@example.org';
export const MAP_STYLE_URL =
  import.meta.env.PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron';
export const SITE_NAME = 'Where They Went';
export const SITE_NAME_ZH = '他們去了哪裡';
export const DATA_BASE = '/data/v1';
export const REPO_URL = 'https://github.com/Lakkev/wheretheywent';
