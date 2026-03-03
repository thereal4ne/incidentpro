from django.views.generic import TemplateView

class FrontendAppView(TemplateView):
    # This must match the name of the file in your React 'build' folder
    template_name = 'index.html'
