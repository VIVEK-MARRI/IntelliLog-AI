import folium
from streamlit_folium import st_folium
import streamlit as st

m = folium.Map(location=[12.97, 77.59], zoom_start=12)
folium.Marker([12.97, 77.59], tooltip="Test Marker").add_to(m)
st_folium(m, width=800, height=500)
