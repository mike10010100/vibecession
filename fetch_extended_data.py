import os
import urllib.request
import pandas as pd
import numpy as np
import json

os.makedirs('data', exist_ok=True)

EXTENDED_SERIES_MAP = {
    'UMCSENT': 'Consumer_Sentiment',
    'CPIAUCSL': 'CPI_All_Items',
    'UNRATE': 'Unemployment_Rate',
    'GDPC1': 'Real_GDP',
    'AHETPI': 'Average_Hourly_Earnings',
    'MORTGAGE30US': 'Mortgage_30Y',
    'FEDFUNDS': 'Fed_Funds_Rate',
    'CPIUFDNS': 'CPI_Food',
    'CPIENGSL': 'CPI_Energy',
    'CUSR0000SEHA': 'CPI_Rent',
    'GASREGCOVW': 'Gas_Prices',
    'REVOLSL': 'Revolving_Consumer_Credit',
    'DRCCLACBS': 'Credit_Card_Delinquency_Rate',
    'PSAVERT': 'Personal_Savings_Rate',
    'TDSP': 'Debt_Service_Ratio',
    'LES1252881600Q': 'Real_Median_Weekly_Earnings',
    'CSUSHPISA': 'Case_Shiller_Index',
    'RRSFS': 'Real_Retail_Sales',
    'USEPUINDXD': 'Policy_Uncertainty',
    'A067RX1A020NBEA': 'Real_Disposable_Income',
    'TERMCBCCINTNS': 'Credit_Card_APR',
    'TERMCBAUTO48NS': 'Auto_Loan_Rate',
    'CUSR0000SETA02': 'Auto_Insurance_CPI'
}

def restore_missing_csvs():
    json_path = 'public/dataset/economic_data.json'
    if not os.path.exists(json_path):
        print(f"Warning: {json_path} not found. Cannot restore raw CSVs.")
        return
    print("Restoring raw CSV data from public/dataset/economic_data.json...")
    try:
        df_json = pd.read_json(json_path)
        for series_id, name in EXTENDED_SERIES_MAP.items():
            dest_path = f"data/{series_id}.csv"
            if not os.path.exists(dest_path):
                if name in df_json.columns:
                    print(f"Recreating {dest_path} from JSON...")
                    sub_df = df_json[['Date', name]].dropna()
                    sub_df.columns = ['observation_date', series_id]
                    os.makedirs('data', exist_ok=True)
                    sub_df.to_csv(dest_path, index=False)
    except Exception as e:
        print(f"Error restoring CSVs from JSON: {e}")

def download_all_data():
    import time
    print("Downloading extended data from FRED...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    }
    for series_id, name in EXTENDED_SERIES_MAP.items():
        dest_path = f"data/{series_id}.csv"
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 100:
            print(f"File {dest_path} already exists. Skipping download.")
            continue
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
        
        # Download with retries
        success = False
        for attempt in range(3):
            try:
                print(f"Fetching {series_id} ({name}) - Attempt {attempt + 1}...")
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as response:
                    content = response.read()
                with open(dest_path, 'wb') as f:
                    f.write(content)
                success = True
                break
            except Exception as e:
                print(f"Error on attempt {attempt + 1} for {series_id}: {e}")
                if attempt < 2:
                    time.sleep(2)
        
        if not success:
            print(f"Failed to download {series_id} after 3 attempts.")
            if os.path.exists(dest_path):
                print(f"Retaining existing file {dest_path}")
            else:
                print(f"No existing file found for {series_id}")
        else:
            # Sleep 3 seconds after successful download to respect rate limits
            time.sleep(3)

def load_and_preprocess_extended():
    dfs = []
    for series_id, name in EXTENDED_SERIES_MAP.items():
        filepath = f"data/{series_id}.csv"
        col_to_use = series_id
        
        # Fallback for Auto Insurance CPI: if CUSR0000SETA02 is missing, check if PCU5241265241261 is available
        if series_id == 'CUSR0000SETA02' and not os.path.exists(filepath):
            fallback_path = "data/PCU5241265241261.csv"
            if os.path.exists(fallback_path):
                print(f"Warning: {filepath} not found. Falling back to {fallback_path}...")
                filepath = fallback_path
                col_to_use = 'PCU5241265241261'

        if not os.path.exists(filepath):
            print(f"Warning: {filepath} not found. Skipping.")
            continue
        
        try:
            df = pd.read_csv(filepath, parse_dates=['observation_date'], index_col='observation_date')
        except Exception as e:
            print(f"Error parsing {filepath}: {e}. Removing.")
            if os.path.exists(filepath):
                os.remove(filepath)
            continue
            
        df[col_to_use] = pd.to_numeric(df[col_to_use].replace('.', np.nan), errors='coerce')
        
        # Resample to monthly (end of month)
        if series_id in ['MORTGAGE30US', 'GASREGCOVW']:
            df_monthly = df.resample('M').mean()
        elif series_id in ['GDPC1', 'LES1252881600Q', 'TDSP', 'TERMCBCCINTNS', 'TERMCBAUTO48NS']:
            # Quarterly series -> forward fill to monthly
            df_monthly = df.resample('M').ffill()
        else:
            df_monthly = df.resample('M').mean()
            
        df_monthly.columns = [name]
        dfs.append(df_monthly)
        
    merged = dfs[0]
    for df in dfs[1:]:
        merged = merged.join(df, how='outer')
        
    # Forward fill gaps for quarterly data and any daily/weekly residuals
    merged = merged.ffill()
    return merged

def compute_derived(df):
    # Year-over-Year changes
    df['CPI_YoY'] = df['CPI_All_Items'].pct_change(12) * 100
    df['Food_YoY'] = df['CPI_Food'].pct_change(12) * 100
    df['Energy_YoY'] = df['CPI_Energy'].pct_change(12) * 100
    df['Rent_YoY'] = df['CPI_Rent'].pct_change(12) * 100
    df['Wage_YoY'] = df['Average_Hourly_Earnings'].pct_change(12) * 100
    df['Real_Wage_Growth_YoY'] = df['Wage_YoY'] - df['CPI_YoY']
    df['Real_GDP_YoY'] = df['Real_GDP'].pct_change(12) * 100
    df['HPI_YoY'] = df['Case_Shiller_Index'].pct_change(12) * 100
    df['Real_Retail_Sales_YoY'] = df['Real_Retail_Sales'].pct_change(12) * 100
    
    # Real wage index (hourly)
    df['Real_Wage_Index'] = (df['Average_Hourly_Earnings'] / df['CPI_All_Items']) * 100
    df['Real_Wage_Index_YoY'] = df['Real_Wage_Index'].pct_change(12) * 100
    
    # Misery Index
    df['Misery_Index'] = df['Unemployment_Rate'] + df['CPI_YoY']

    # Decayed CPI Shock (Jan 2020 baseline - 50% annual decay rate per Cummings & Mahoney)
    df['Monthly_Inflation'] = df['CPI_All_Items'].pct_change()
    decay_factor = 0.5 ** (1/12)
    decayed_shocks = []
    current_shock = 0.0
    for idx, row in df.iterrows():
        if idx < pd.Timestamp('2020-01-01'):
            decayed_shocks.append(0.0)
        else:
            inf = row['Monthly_Inflation']
            if pd.isna(inf):
                inf = 0.0
            current_shock = inf + decay_factor * current_shock
            decayed_shocks.append(current_shock * 100)
    df['Decayed_CPI_Shock_2020'] = decayed_shocks
    
    # Cumulative price increases since Jan 2019 and Jan 2020
    for year in [2019, 2020]:
        cpi_col = f'Cumulative_CPI_Increase_{year}'
        food_col = f'Cumulative_Food_Increase_{year}'
        rent_col = f'Cumulative_Rent_Increase_{year}'
        wage_col = f'Cumulative_Wage_Increase_{year}'
        real_wage_col = f'Cumulative_Real_Wage_{year}'
        hpi_col = f'Cumulative_HPI_Increase_{year}'
        
        jan_cpi = df.loc[f'{year}-01-31', 'CPI_All_Items'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_All_Items'].mean()
        jan_food = df.loc[f'{year}-01-31', 'CPI_Food'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_Food'].mean()
        jan_rent = df.loc[f'{year}-01-31', 'CPI_Rent'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'CPI_Rent'].mean()
        jan_wages = df.loc[f'{year}-01-31', 'Average_Hourly_Earnings'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'Average_Hourly_Earnings'].mean()
        jan_hpi = df.loc[f'{year}-01-31', 'Case_Shiller_Index'] if f'{year}-01-31' in df.index else df.loc[f'{year}-01-25':f'{year}-02-05', 'Case_Shiller_Index'].mean()
        
        df[cpi_col] = (df['CPI_All_Items'] / jan_cpi - 1) * 100
        df[food_col] = (df['CPI_Food'] / jan_food - 1) * 100
        df[rent_col] = (df['CPI_Rent'] / jan_rent - 1) * 100
        df[wage_col] = (df['Average_Hourly_Earnings'] / jan_wages - 1) * 100
        df[real_wage_col] = df[wage_col] - df[cpi_col]
        df[hpi_col] = (df['Case_Shiller_Index'] / jan_hpi - 1) * 100

    return df

def save_json_for_dashboard(df):
    df_reset = df.reset_index()
    df_reset['Date'] = df_reset['observation_date'].dt.strftime('%Y-%m-%d')
    df_reset = df_reset.drop(columns=['observation_date'])
    df_reset = df_reset.replace({np.nan: None})
    
    # Save directly to public folder so React can fetch it!
    os.makedirs('public/dataset', exist_ok=True)
    json_path = 'public/dataset/economic_data.json'
    data_list = df_reset.to_dict(orient='records')
    with open(json_path, 'w') as f:
        json.dump(data_list, f, indent=2)
    print(f"JSON data written to {json_path}")

if __name__ == "__main__":
    # Restore missing raw CSV files from JSON to prevent errors if FRED fails
    restore_missing_csvs()
    
    # Try pulling fresh data from FRED
    download_all_data()
    
    df = load_and_preprocess_extended()
    df = compute_derived(df)
    df.to_csv('data/economic_data_extended.csv')
    save_json_for_dashboard(df)
    print("Extended data pipeline completed successfully!")
