function LookupDocumentUploadModel(ctx, fieldName, mode) {
    var self = this;
    self.FieldName = fieldName;
    self.Context = ko.observable();
    self.Item = ko.observable();
    self.ContainerId = ko.computed(function () {
        if (self.Context() && self.Item())
            return self.Context().listId + "_" + self.Item().Id;

        return null;
    });

    self.Bound = false;
    self.Bind = function () {
        if (!self.Bound && self.ContainerId()) {
            self.Bound = true;
            var elem = document.getElementById(self.ContainerId());
            jQuery(elem).load("/_layouts/15/AlmondLabs.CustomLookupField/ko/LookupDocumentUpload.html", function () {
                ko.applyBindings(self, elem);
            });
        }
    };

    self.Save = function () {
        return "updated field value";
    };

    self.LoadContext = function (ctx) {
        ctx.listId = ctx.listName ?
            ctx.listName.replace(/{|}/g, "") :
            ctx.FormContext.listAttributes.Id;
        self.Context(ctx);
        self.Item("starting field value");
    };

    self.toString = function () {
        return "<div id='" + self.ContainerId() + "'></div>";
    };

    self.LoadContext(ctx);
    self.Mode(mode);
    if (mode == "Edit") {
        var formCtx = SPClientTemplates.Utility.GetFormContextForCurrentField(ctx);
        formCtx.registerGetValueCallback(formCtx.fieldName, self.Save);
    }
}

(function () {
    var pageModels = new Array();
    var fieldName = "LookupDocumentUpload";

    function View(ctx) {
        pageModels[pageModels.length] = new ViewModel(ctx, fieldName, "View");
        return pageModels[pageModels.length - 1];
    };
    function Display(ctx) {
        pageModels[pageModels.length] = new ViewModel(ctx, fieldName, "Display");
        return pageModels[pageModels.length - 1];
    };
    function Edit(ctx) {
        pageModels[pageModels.length] = new ViewModel(ctx, fieldName, "Edit");
        return pageModels[pageModels.length - 1];
    }

    if (typeof SPClientTemplates === 'undefined')
        return;

    var fieldCtx = {};
    fieldCtx.OnPostRender = function (ctx) {
        for (var x = 0; x < pageModels.length; x++) {
            pageModels[x].Bind();
        }
    };
    fieldCtx.Templates = {};
    fieldCtx.Templates.Fields = {
        'LookupDocumentUpload': {
            'View': View,
            'DisplayForm': Display,
            'EditForm': Edit,
            'NewForm': Edit
        }
    };

    SPClientTemplates.TemplateManager.RegisterTemplateOverrides(fieldCtx);
})();