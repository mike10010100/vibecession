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
    
    # Calculate Decayed CPI Shock (Jan 2020 baseline - 50% annual decay per Cummings & Mahoney)
    decay_factor = 0.5 ** (1/12) # halving every 12 months (~0.94387)
    decayed_shocks = []
    current_shock = 0.0
    
    for idx, row in df.iterrows():
        # Baseline start is Jan 2020
        if row['Parsed_Date'] < pd.Timestamp('2020-01-01'):
            decayed_shocks.append(0.0)
        else:
            inf = row['Monthly_Inflation']
            if pd.isna(inf):
                inf = 0.0
            current_shock = inf + decay_factor * current_shock
            decayed_shocks.append(current_shock * 100) # scale to percentage
            
    df['Decayed_CPI_Shock_2020'] = decayed_shocks
    
    # Format Date back to string %Y-%m-%d
    df['Date'] = df['Parsed_Date'].dt.strftime('%Y-%m-%d')
    
    # Drop temp parsing column
    df = df.drop(columns=['Parsed_Date', 'Monthly_Inflation'])
    
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
    print("Decayed CPI Shock calculation completed successfully!")

if __name__ == '__main__':
    main()
