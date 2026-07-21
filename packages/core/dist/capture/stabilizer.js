/**
 * Apply all stabilization steps to a Puppeteer page before taking a screenshot.
 * This ensures consistent, deterministic captures regardless of dynamic content.
 */
export async function stabilizePage(page, config) {
    // Disable CSS animations and transitions
    if (config.disableAnimations) {
        await page.addStyleTag({
            content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
        });
    }
    // Wait for fonts to load
    if (config.waitForFonts) {
        await page
            .evaluate(() => document.fonts.ready)
            .catch(() => {
            // Non-fatal — some pages may not support fonts.ready
        });
    }
    // Wait for all images to load
    if (config.waitForImages) {
        await page
            .evaluate(() => {
            const images = Array.from(document.images);
            return Promise.all(images.map((img) => new Promise((resolve) => {
                if (img.complete) {
                    resolve();
                }
                else {
                    img.addEventListener('load', () => resolve());
                    img.addEventListener('error', () => resolve()); // Don't fail on broken images
                }
            })));
        })
            .catch(() => {
            // Non-fatal
        });
    }
    // Wait for specific selectors indicating block decoration is complete
    for (const selector of config.waitForSelectors) {
        await page.waitForSelector(selector, { timeout: 10_000 }).catch(() => {
            // Non-fatal — page may not have these blocks
        });
    }
    // Hide selectors (e.g. cookie banners)
    if (config.hideSelectors.length > 0) {
        await page
            .evaluate((selectors) => {
            for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                for (const el of elements) {
                    el.style.visibility = 'hidden';
                }
            }
        }, config.hideSelectors)
            .catch(() => {
            // Non-fatal
        });
    }
    // Mask dynamic content (replace with a solid grey box)
    if (config.maskSelectors.length > 0) {
        await page
            .evaluate((selectors) => {
            for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                for (const el of elements) {
                    el.style.background = '#cccccc';
                    el.style.color = 'transparent';
                    el.style.border = 'none';
                }
            }
        }, config.maskSelectors)
            .catch(() => {
            // Non-fatal
        });
    }
    // Final delay to let any remaining async rendering settle
    if (config.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.delayMs));
    }
}
//# sourceMappingURL=stabilizer.js.map