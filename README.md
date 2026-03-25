# OPEN TRAINAA

[![Preview](docs/preview.png)](https://app.trainaa.com)

TRAINAA is an open-source endurance training app based on LLMs and agent systems. 

> Bring your own OpenRouter API key and use the app for free!


[Start now on the web](https://app.trainaa.com)

or download the app:

[App Store](https://apps.apple.com/de/app/trainaa/id6758528495)

[Google Play](https://play.google.com/store/apps/details?id=com.pacerchat.app)


And dont forget to [Join our Discord](https://discord.gg/ehMPJErVRN) 

The app is in a early stage of development, so dont expect it to be perfect yet. But there is also a lot of potential and you can be part of the journey to build the best endurance training app for everybody.


To get started locally, follow the instructions in the [Getting Started Guide](https://jnkue.github.io/open-trainaa/).

## Contributing

We welcome contributions from the community! If you're interested in contributing to TRAINAA, please check out our [Contributing Guide](https://jnkue.github.io/open-trainaa/getting-started/contributing/) for guidelines on how to get involved.


## Roadmap

### First priority 

- **More integrations** —  Apple Health, Polar, Suunto, Corso etc. (Strava does not allow integration.)

- **Goal setting** — Users can set explicit goals (e.g. a target race with date, or general objectives like "stay fit" or "lose weight"). Goals are extracted from chat by the agent today; explicit goal-setting UI comes next. Goals are injected into the AI context to personalize all coaching.
- **Auto-generated training plans** — Reactive system that generates and adjusts training based on goals, training history, and completed/missed sessions without the need for constant user interaction. Includes explicit "generate training" actions so users don't have to chat for every plan update.
- **Improve training plan generation** — Include more algorithmc logic into the backend (e.g. periodization, recovery weeks, tapering) rather than relying on the LLM to figure it out. More structured prompting and post-processing to ensure valid plans.
- **Workout analytics & trends** — Personal records, volume/intensity over time, progress toward goals.

### Second priority

- **AI backend overhaul** — Migrate away from LangChain to direct SDK calls for more control, better debugging, and lower abstraction overhead. Improve prompt engineering and coaching quality.



### Backlog

- **Different trainer personalities** — Choose coaching styles (strict, encouraging, data-driven, etc.).

For a detailed roadmap a [github project](https://github.com/users/jnkue/projects/5) is set up.

## License

Distributed under the AGPL License. See LICENSE for more information.

### Trademark Notice

Permission to use the software under AGPL-3.0 does **not** include the right to use the trademarks, logo, or name "TRAINAA".
