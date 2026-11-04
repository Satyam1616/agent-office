import { describe, expect, it } from "bun:test";
import { startStaticDemo } from "./demo";
import { useOffice } from "./store";

describe("Web Static Demo (?demo=1)", () => {
  it("initializes static demo mode, sets connected true, and populates sessions", async () => {
    let messageReceived = false;
    startStaticDemo(
      () => {
        messageReceived = true;
      },
      () => {
        useOffice.setState({
          connected: true,
          stats: {
            today: {
              claude: 15,
              gemini: 18,
            },
          },
        });
      },
    );

    const state = useOffice.getState();
    expect(state.connected).toBe(true);
    expect(state.stats.today.claude).toBe(15);
    expect(state.stats.today.gemini).toBe(18);

    // Wait for the next tick where startDemo emits initial sessions
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messageReceived).toBe(true);
  });
});
