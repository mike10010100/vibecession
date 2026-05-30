# The Vibecession Storyboard (2020–2026)

An interactive, data-driven editorial dashboard exploring the **Dual-Core Vibecession Hypothesis**. This project analyzes the divergence between strong macroeconomic indicators (GDP, low unemployment) and depressed consumer sentiment in the post-pandemic era.

## Features

- **OLS Regression Sandbox:** Reconstruct traditional and behavioral models of consumer sentiment with real-time statistics (including $R^2$, Durbin-Watson, and Variance Inflation Factors to diagnose multicollinearity and serial correlation).
- **Cash-Flow Squeeze Explorer:** Track the cumulative price shocks on necessities (food, gas, rent, auto insurance) alongside interest rate spikes (credit card APRs, mortgages, auto loans) and personal savings depletion.
- **"Do-Say" Disconnect Visualizer:** Graph the divergence between normalized sentiment and real consumer spending, overlaid with home price wealth effects and policy uncertainty.
- **Aligned Cycle Histories:** Compare the post-2020 recovery curve with past stagflation (1978) and recession (2007) timelines.

## Data Sources

All datasets are automatically retrieved from the **Federal Reserve Bank of St. Louis (FRED)** database using a paced caching script to respect rate limits.

## CI/CD Automation

This project automatically builds and deploys to **GitHub Pages** on every push to the `main` branch via GitHub Actions.

