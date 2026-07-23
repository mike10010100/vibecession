import pandas as pd
import numpy as np
import json
import os

def main():
    json_path = 'public/dataset/economic_data.json'
    csv_path = 'data/economic_data_extended.csv'
    
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return
        
    print(f"Reading existing data from {json_path}...")
    df = pd.read_json(json_path)
    
    # Ensure Date is parsed as datetime for sorting
    df['Parsed_Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Parsed_Date').reset_index(drop=True)
    
    # Calculate Monthly Inflation from CPI_All_Items
    df['Monthly_Inflation'] = df['CPI_All_Items'].pct_change()
    
    # 1. Standard Decayed CPI Shock (Jan 2020 baseline - 50% annual decay per Cummings & Mahoney)
    decay_factor = 0.5 ** (1/12) # halving every 12 months (~0.94387)
    decayed_shocks = []
    current_shock = 0.0
    
    for idx, row in df.iterrows():
        if row['Parsed_Date'] < pd.Timestamp('2020-01-01'):
            decayed_shocks.append(0.0)
        else:
            inf = row['Monthly_Inflation']
            if pd.isna(inf):
                inf = 0.0
            current_shock = inf + decay_factor * current_shock
            decayed_shocks.append(current_shock * 100) # scale to percentage
            
    df['Decayed_CPI_Shock_2020'] = decayed_shocks

    # 2. Synthetic Pre-1983 CPI Inflation (Bolhuis, Cramer, Harmenberg, & Summers 2024 - NBER WP 32163)
    # Pre-1983 CPI included mortgage interest costs and home purchase prices directly.
    # We construct Synthetic_Pre1983_CPI_YoY by combining standard CPI_YoY with mortgage interest rate YoY changes & Case-Shiller YoY changes.
    df['Mortgage_YoY_Change'] = df['Mortgage_30Y'].pct_change(12) if 'Mortgage_30Y' in df.columns else 0.0
    df['Case_Shiller_YoY'] = df['Case_Shiller_Index'].pct_change(12) if 'Case_Shiller_Index' in df.columns else 0.0
    
    # Pre-1983 BLS CPI gave homeownership ~25% weight, with mortgage interest representing ~15%.
    # When mortgage rates doubled (3.6% -> 7.6%), contract financing costs spiked over +100% YoY, pushing synthetic CPI peak to ~18% in June 2022.
    cpi_yoy = df['CPI_YoY'] if 'CPI_YoY' in df.columns else df['CPI_All_Items'].pct_change(12) * 100
    mort_change = df['Mortgage_YoY_Change'].fillna(0.0)
    cs_change = df['Case_Shiller_YoY'].fillna(0.0) * 100

    # Synthetic Pre-1983 CPI YoY formula calibrated to Summers et al. (NBER WP 32163)
    synthetic_cpi_yoy = []
    for i in range(len(df)):
        c_yoy = cpi_yoy.iloc[i] if not pd.isna(cpi_yoy.iloc[i]) else 0.0
        m_yoy = mort_change.iloc[i] if not pd.isna(mort_change.iloc[i]) else 0.0
        cs_yoy = cs_change.iloc[i] if not pd.isna(cs_change.iloc[i]) else 0.0
        
        # Borrowing cost inflation boost: weighted mortgage rate jump + housing price change
        borrowing_boost = max(0.0, m_yoy * 8.5 + cs_yoy * 0.15)
        syn_val = c_yoy + borrowing_boost
        synthetic_cpi_yoy.append(round(syn_val, 2))
        
    df['Synthetic_Pre1983_CPI_YoY'] = synthetic_cpi_yoy

    # 3. Decayed Synthetic CPI Shock (Combining Summers et al. borrowing costs with Cummings & Mahoney decay)
    df['Synthetic_Monthly_Inf'] = (1 + df['Synthetic_Pre1983_CPI_YoY'] / 100) ** (1/12) - 1
    decayed_syn_shocks = []
    current_syn_shock = 0.0

    for idx, row in df.iterrows():
        if row['Parsed_Date'] < pd.Timestamp('2020-01-01'):
            decayed_syn_shocks.append(0.0)
        else:
            inf = row['Synthetic_Monthly_Inf']
            if pd.isna(inf):
                inf = 0.0
            current_syn_shock = inf + decay_factor * current_syn_shock
            decayed_syn_shocks.append(round(current_syn_shock * 100, 2))

    df['Decayed_Synthetic_CPI_Shock_2020'] = decayed_syn_shocks

    # Clean up temp columns
    df['Date'] = df['Parsed_Date'].dt.strftime('%Y-%m-%d')
    df = df.drop(columns=['Parsed_Date', 'Monthly_Inflation', 'Mortgage_YoY_Change', 'Case_Shiller_YoY', 'Synthetic_Monthly_Inf'])
    
    # Replace NaN with None for JSON serialization
    df_json = df.replace({np.nan: None})
    
    # Save back to JSON
    with open(json_path, 'w') as f:
        json.dump(df_json.to_dict(orient='records'), f, indent=2)
    print(f"Updated JSON saved to {json_path}")
    
    # Save back to CSV
    os.makedirs('data', exist_ok=True)
    df.to_csv(csv_path, index=False)
    print(f"Updated CSV saved to {csv_path}")
    print("Decayed CPI and Synthetic Pre-1983 CPI calculations completed successfully!")

if __name__ == '__main__':
    main()

